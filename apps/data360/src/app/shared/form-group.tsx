import cn from '@core/utils/class-names';

interface FormGroupProps {
  title: React.ReactNode;
  className?: string;
  description?: string;
  children?: React.ReactNode;
}

export default function FormGroup({
  title,
  className,
  description,
  children,
}: FormGroupProps) {
  return (
    <div className={cn('grid gap-5 @3xl:grid-cols-12', className)}>
      <div className="col-span-full @4xl:col-span-4">
        <h4 className="text-base font-medium text-gray-900 dark:text-white">{title}</h4>
        {description && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      </div>
      {children && (
        <div className="col-span-full @2xl:grid-cols-2 @4xl:col-span-8">
          {children}
        </div>
      )}
    </div>
  );
}
