/** A row of mutually exclusive buttons exposed as a radio group. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} role="radio" aria-checked={value === id} className={value === id ? 'selected' : ''} onClick={() => onChange(id)}>
          {text}
        </button>
      ))}
    </div>
  );
}
