import type { Metadata } from "next";
import AdminMetricsView from "@/components/app/AdminMetricsView";

export const metadata: Metadata = { title: "Metrics" };

export default function AdminPage() {
  return <AdminMetricsView />;
}
