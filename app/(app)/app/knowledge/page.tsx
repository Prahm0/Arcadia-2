import { redirect } from "next/navigation";

// Subjects, their notes and what Arcad knows now live on the profile.
export default function KnowledgePage() {
  redirect("/app/profile#subjects");
}
