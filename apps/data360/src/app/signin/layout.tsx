/**
 * Signin layout - isolates the signin page from the dashboard layout
 * Uses position fixed to ensure complete isolation from any parent layout content
 */
export default function SigninLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-white dark:bg-gray-900">
      {children}
    </div>
  );
}
