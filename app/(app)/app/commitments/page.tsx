import { redirect } from "next/navigation";

// Co-curriculars and school hours now live on the profile.
export default function CommitmentsPage() {
  redirect("/app/profile#cocurriculars");
}
