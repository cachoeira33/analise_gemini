'use client'

import { Info } from 'lucide-react'

interface InfoTooltipProps {
  text:    string
  /** 'sm' = 14px icon (default), 'md' = 16px icon */
  size?:   'sm' | 'md'
  /** Which side the tooltip appears. Defaults to 'top'. */
  side?:   'top' | 'bottom'
}

/**
 * Hover-activated tooltip for financial terms.
 * Usage: <InfoTooltip text="Return on Investment: net profit ÷ total cost × 100" />
 */
export function InfoTooltip({ text, size = 'sm', side = 'top' }: InfoTooltipProps) {
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  const tipPosition = side === 'top'
    ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
    : 'top-full left-1/2 -translate-x-1/2 mt-2'

  const arrowClass = side === 'top'
    ? 'absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border'
    : 'absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-border'

  return (
    <span className="relative inline-flex group/tip align-middle ml-1">
      <Info
        className={`${iconClass} text-muted-foreground hover:text-foreground cursor-help transition-colors shrink-0`}
      />
      <span
        role="tooltip"
        className={`
          absolute ${tipPosition} z-50
          w-52 rounded-lg border border-border bg-card
          px-3 py-2 text-xs text-foreground leading-relaxed shadow-2xl
          opacity-0 pointer-events-none
          group-hover/tip:opacity-100
          transition-opacity duration-150
          whitespace-normal
        `}
      >
        {text}
        <span className={arrowClass} />
      </span>
    </span>
  )
}
