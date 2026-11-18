/** A small numbered "how it works" row shown in empty states. */
export default function StepHints({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-stone-600">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center bg-stone-900 text-[11px] font-bold text-white">{i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}
