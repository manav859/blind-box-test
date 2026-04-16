import type {
  ChangeEventHandler,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function FormField({ label, hint, error, children }: FormFieldProps) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      {hint ? <span className="form-hint">{hint}</span> : null}
      {children}
      {error ? <span className="form-error">{error}</span> : null}
    </label>
  );
}

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={joinClassNames("text-input", className)} {...props} />;
}

export function SelectInput({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={joinClassNames("text-input", className)} {...props} />;
}

export function TextAreaInput({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={joinClassNames("text-input", "text-area", className)}
      {...props}
    />
  );
}

export interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
  hint?: string;
}

export function CheckboxField({
  label,
  checked,
  onChange,
  hint,
}: CheckboxFieldProps) {
  return (
    <label className="checkbox-field">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
}
