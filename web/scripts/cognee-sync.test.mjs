import assert from "node:assert/strict";
import test from "node:test";
import { publicDocuments } from "../../scripts/sync-cognee.mjs";

const project = (id, person) => ({ id, title: `Project ${id}`, url: `https://devpost.com/software/${id}`, team: [person], event_id: "event:one", description: "A public climate prototype", built_with: ["Python"] });

test("Cognee sync excludes hidden members and local opt-outs before upload", () => {
  const snapshot = { events: [], projects: [project("public", { id: "person:public", name: "Public Builder" }), project("hidden", { id: "person:hidden", hidden: true }), project("opt-out", { id: "person:opt-out" })] };
  const documents = publicDocuments(snapshot, [{ personId: "person:opt-out", hidden: true, buildingNow: "PRIVATE" }]);
  assert.deepEqual(documents.map((document) => document.id), ["public"]);
  assert.doesNotMatch(JSON.stringify(documents), /PRIVATE|person:hidden|person:opt-out/);
});

test("Cognee records retain canonical source IDs and explicit builder relationships", () => {
  const snapshot = { events: [{ id: "event:one", title: "London Hack", url: "https://example.com/event", organization: "Public Organiser" }], projects: [project("devpost:climate", { id: "devpost:builder", name: "Public Builder", devpost_url: "https://devpost.com/builder" })] };
  const [document] = publicDocuments(snapshot);
  assert.match(document.text, /Afterlife project ID: devpost:climate/);
  assert.match(document.text, /builder devpost:builder BUILT project devpost:climate/);
  assert.match(document.text, /https:\/\/devpost.com\/software\/devpost:climate/);
  assert.match(document.text, /London Hack/);
  assert.match(document.text, /funding relationships are not established/);
});

test("Cognee sync never uploads private claim answers or local introduction intents", () => {
  const snapshot = { events: [], projects: [project("public", { id: "person:public" })] };
  const profiles = [{ personId: "person:public", hidden: false, buildingNow: "PRIVATE_BUILD", wantToMeet: "PRIVATE_INVESTOR" }];
  const documents = publicDocuments(snapshot, profiles);
  assert.equal(documents.length, 1);
  assert.doesNotMatch(documents[0].text, /PRIVATE_BUILD|PRIVATE_INVESTOR/);
});
