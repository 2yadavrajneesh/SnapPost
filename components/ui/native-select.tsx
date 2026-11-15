"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Opt = { value: string; label: React.ReactNode; disabled?: boolean }
const EMPTY = "__empty__"

/** Reads <option> children so existing call sites keep their markup. */
function collect(children: React.ReactNode, out: Opt[] = []): Opt[] {
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return
    const p = c.props as { value?: string | number; children?: React.ReactNode; disabled?: boolean }
    if (c.type === React.Fragment || c.type === "optgroup") return void collect(p.children, out)
    if (c.type === "option") {
      const text = React.Children.toArray(p.children).map((x) => (typeof x === "string" || typeof x === "number" ? String(x) : "")).join("")
      out.push({ value: String(p.value ?? text), label: p.children, disabled: p.disabled })
    }
  })
  return out
}

type Props = Omit<React.ComponentProps<"select">, "size" | "onChange" | "value"> & {
  size?: "sm" | "default"
  value?: string | number
  onChange?: (e: { target: { value: string } }) => void
}

/** The site's drop-down list (shadcn Select). Accepts <option> children and an onChange that reads e.target.value. */
function NativeSelect({ className, size = "default", value, onChange, children, disabled, id, title, ...props }: Props) {
  const opts = collect(children)
  const v = value === undefined ? undefined : String(value)
  return (
    <Select value={v === "" ? EMPTY : v} onValueChange={(x) => onChange?.({ target: { value: x === EMPTY ? "" : x } })} disabled={disabled}>
      <SelectTrigger
        id={id}
        title={title}
        size={size}
        aria-label={props["aria-label"]}
        className={cn("w-full rounded-none text-left", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="rounded-none border-stone-300 bg-white p-1 shadow-lg">
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value === "" ? EMPTY : o.value} disabled={o.disabled} className="rounded-none py-2 text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export { NativeSelect }
