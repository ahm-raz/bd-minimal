import { PageSkeleton } from "@/components/common/page-skeleton";

export default function Loading() {
  return <PageSkeleton label="Loading schedules" rows={5} />;
}
