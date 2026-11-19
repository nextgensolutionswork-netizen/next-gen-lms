import { StudentFeeStatement } from '@/components/accounts/student-fee-statement';

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudentFeeStatement studentId={id} />;
}
