export const MAP_HALF_EXTENT = 115;
export const MAP_OFFSET_LIMIT = 10;
export const MAP_POSITION_RADIUS = 75;
export const MAP_MIN_NODE_DISTANCE = 12;

export function mapCoordinate(score: number, dimension: string) {
  const finiteScore = Number.isFinite(score) ? score : 0;
  const normalized = dimension === "commercial" ? finiteScore : finiteScore * 2 - 1;
  return Math.max(-1, Math.min(1, normalized)) * MAP_HALF_EXTENT;
}

function stableHash(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/** Stable, bounded rendering offsets. These values never alter evidence scores. */
export function makeMapOffsets(ids: string[], dimensions: string[]) {
  const uniqueIds = [...new Set(ids)];
  const offsets = new Map(uniqueIds.map((id) => [id, {} as Record<string, number>]));
  for (const dimension of dimensions) {
    const ordered = uniqueIds.map((id) => ({ id, hash: stableHash(`${dimension}\0${id}`) }))
      .sort((a, b) => a.hash - b.hash || a.id.localeCompare(b.id));
    ordered.forEach(({ id }, index) => {
      const value = ordered.length < 2 ? 0 : MAP_OFFSET_LIMIT * (2 * index / (ordered.length - 1) - 1);
      offsets.get(id)![dimension] = value;
    });
  }
  return offsets;
}

type MapPoint = { x: number; y: number; z: number };
type MapProjectScores = { id: string; scores: Record<string, number> };

/**
 * Gives each project a stable, bounded 3D position near its evidence anchor.
 * Run this over the full catalog before filtering so visible positions do not
 * jump as search results or other filters change.
 */
export function buildMapPositions(projects: MapProjectScores[], dimensions: { x: string; y: string; z: string }) {
  const axes = [dimensions.x, dimensions.y, dimensions.z];
  const unique = new Map(projects.map((project) => [project.id, project]));
  const ordered = [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
  const anchors = ordered.map((project) => axes.map((axis) => mapCoordinate(project.scores[axis] ?? 0, axis)));
  const distinctByAxis = axes.map((_, axis) => [...new Set(anchors.map((anchor) => anchor[axis]))].sort((a, b) => a - b));
  const bounds = anchors.map((anchor) => anchor.map((value, axis) => {
    const distinct = distinctByAxis[axis];
    const index = distinct.indexOf(value);
    const epsilon = 0.01;
    return [index > 0 ? -(value - distinct[index - 1]) / 2 + epsilon : -MAP_POSITION_RADIUS,
      index + 1 < distinct.length ? (distinct[index + 1] - value) / 2 - epsilon : MAP_POSITION_RADIUS];
  }));
  const clampOffset = (offset: number[], index: number) => {
    for (let axis = 0; axis < 3; axis += 1) offset[axis] = Math.max(bounds[index][axis][0], Math.min(bounds[index][axis][1], offset[axis]));
    const radius = Math.hypot(...offset);
    if (radius > MAP_POSITION_RADIUS) {
      const scale = MAP_POSITION_RADIUS / radius;
      for (let axis = 0; axis < 3; axis += 1) offset[axis] *= scale;
    }
  };
  const offsets = ordered.map((project) => {
    const vector = axes.map((axis) => (stableHash(`${project.id}\0${axis}\0map-position`) / 0xffffffff) * 2 - 1);
    const length = Math.hypot(...vector) || 1;
    const radius = 2 + (stableHash(`${project.id}\0map-radius`) % 200) / 100;
    return vector.map((value) => value / length * radius);
  });
  offsets.forEach(clampOffset);

  // Project pairs apart until the dense source clusters have room to click,
  // while a light anchor spring keeps each point close to its evidence scores.
  const targetDistance = MAP_MIN_NODE_DISTANCE + 2;
  for (let iteration = 0; iteration < 640; iteration += 1) {
    const positions = anchors.map((anchor, index) => anchor.map((value, axis) => value + offsets[index][axis]));
    const cells = new Map<string, number[]>();
    positions.forEach((point, index) => {
      const key = point.map((value) => Math.floor(value / targetDistance)).join(":");
      const members = cells.get(key);
      if (members) members.push(index);
      else cells.set(key, [index]);
    });
    for (let first = 0; first < ordered.length; first += 1) {
      const [cx, cy, cz] = positions[first].map((value) => Math.floor(value / targetDistance));
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
        const candidates = cells.get(`${cx + dx}:${cy + dy}:${cz + dz}`) ?? [];
        for (const second of candidates) {
          if (second <= first) continue;
          const delta = positions[first].map((value, axis) => value - positions[second][axis]);
          let distance = Math.hypot(...delta);
          if (distance >= targetDistance) continue;
          if (distance < 1e-6) {
            const direction = axes.map((axis) => (stableHash(`${ordered[first].id}\0${ordered[second].id}\0${axis}`) / 0xffffffff) * 2 - 1);
            const length = Math.hypot(...direction) || 1;
            delta.splice(0, 3, ...direction.map((value) => value / length));
            distance = 1;
          }
          const correction = (targetDistance - distance) / (2 * distance);
          for (let axis = 0; axis < 3; axis += 1) {
            const movement = delta[axis] * correction;
            offsets[first][axis] += movement;
            offsets[second][axis] -= movement;
          }
          clampOffset(offsets[first], first);
          clampOffset(offsets[second], second);
        }
      }
    }
    for (let index = 0; index < ordered.length; index += 1) {
      const offset = offsets[index];
      for (let axis = 0; axis < 3; axis += 1) offset[axis] *= 0.9992;
      clampOffset(offset, index);
    }
  }

  const positions = new Map<string, { x: number; y: number; z: number; anchor: MapPoint; offset: MapPoint }>();
  ordered.forEach((project, index) => {
    const [x, y, z] = anchors[index].map((value, axis) => value + offsets[index][axis]);
    const [ax, ay, az] = anchors[index];
    const [ox, oy, oz] = offsets[index];
    positions.set(project.id, { x, y, z, anchor: { x: ax, y: ay, z: az }, offset: { x: ox, y: oy, z: oz } });
  });
  return positions;
}
