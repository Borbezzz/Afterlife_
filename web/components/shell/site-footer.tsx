import { Badge } from "@/components/reui/badge";
import { getDataSource } from "@/lib/data";

export async function SiteFooter() {
  const source = await getDataSource();
  const isSupabase = source === "supabase";
  return <footer className="afterlife-footer"><div className="afterlife-footer-inner"><p>Public hackathon work, made useful after the event.</p><Badge variant={isSupabase ? "success-light" : "outline"} size="sm" title={isSupabase ? "Reading from Supabase" : "Supabase is not configured; reading the local project snapshot."}>{isSupabase ? "Supabase source" : "Local project snapshot"}</Badge></div></footer>;
}
