'use client'

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

type Side = 'top' | 'bottom' | 'left' | 'right'

interface HoverCardProps {
  /** The element that triggers the card on hover */
  trigger: ReactNode
  /** The content displayed inside the floating card */
  content: ReactNode
  /** Preferred side to display the card (auto-adjusts on overflow) */
  side?: Side
  /** Delay in ms before showing the card */
  delayMs?: number
  /** Additional className for the card container */
  className?: string
  /** Additional className for the trigger container */
  triggerClassName?: string
  /** Disable the hover card */
  disabled?: boolean
}

interface Position {
  top: number
  left: number
}

const OFFSET = 8          // gap between trigger and card
const CARD_MAX_W = 340    // safety clamp
const CARD_MAX_H = 400    // safety clamp

function computePosition(
  triggerRect: DOMRect,
  cardRect: { width: number; height: number },
  side: Side,
): Position & { actualSide: Side } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cw = Math.min(cardRect.width, CARD_MAX_W)
  const ch = Math.min(cardRect.height, CARD_MAX_H)

  // Centre horizontally/vertically depending on side
  let top = 0, left = 0
  let actualSide = side

  const tryBottom = () => ({
    top: triggerRect.bottom + OFFSET,
    left: triggerRect.left + triggerRect.width / 2 - cw / 2,
  })
  const tryTop = () => ({
    top: triggerRect.top - ch - OFFSET,
    left: triggerRect.left + triggerRect.width / 2 - cw / 2,
  })
  const tryRight = () => ({
    top: triggerRect.top + triggerRect.height / 2 - ch / 2,
    left: triggerRect.right + OFFSET,
  })
  const tryLeft = () => ({
    top: triggerRect.top + triggerRect.height / 2 - ch / 2,
    left: triggerRect.left - cw - OFFSET,
  })

  switch (side) {
    case 'bottom': {
      const pos = tryBottom()
      if (pos.top + ch > vh) {
        const alt = tryTop()
        if (alt.top >= 0) { top = alt.top; left = alt.left; actualSide = 'top'; break }
      }
      top = pos.top; left = pos.left
      break
    }
    case 'top': {
      const pos = tryTop()
      if (pos.top < 0) {
        const alt = tryBottom()
        if (alt.top + ch <= vh) { top = alt.top; left = alt.left; actualSide = 'bottom'; break }
      }
      top = pos.top; left = pos.left
      break
    }
    case 'right': {
      const pos = tryRight()
      if (pos.left + cw > vw) {
        const alt = tryLeft()
        if (alt.left >= 0) { top = alt.top; left = alt.left; actualSide = 'left'; break }
      }
      top = pos.top; left = pos.left
      break
    }
    case 'left': {
      const pos = tryLeft()
      if (pos.left < 0) {
        const alt = tryRight()
        if (alt.left + cw <= vw) { top = alt.top; left = alt.left; actualSide = 'right'; break }
      }
      top = pos.top; left = pos.left
      break
    }
  }

  // Clamp to viewport
  left = Math.max(8, Math.min(left, vw - cw - 8))
  top  = Math.max(8, Math.min(top, vh - ch - 8))

  return { top, left, actualSide }
}

export function HoverCard({
  trigger,
  content,
  side = 'bottom',
  delayMs = 300,
  className,
  triggerClassName,
  disabled = false,
}: HoverCardProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)
  const [mounted, setMounted] = useState(false)

  const triggerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !cardRef.current) return
    const triggerRect = triggerRef.current.getBoundingClientRect()
    const cardRect = cardRef.current.getBoundingClientRect()
    const pos = computePosition(triggerRect, cardRect, side)
    setPosition({ top: pos.top, left: pos.left })
  }, [side])

  const handleEnter = useCallback(() => {
    if (disabled) return
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null }
    enterTimer.current = setTimeout(() => {
      setVisible(true)
      // Position after the card renders (needs a frame for dimensions)
      requestAnimationFrame(() => requestAnimationFrame(updatePosition))
    }, delayMs)
  }, [delayMs, disabled, updatePosition])

  const handleLeave = useCallback(() => {
    if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null }
    leaveTimer.current = setTimeout(() => setVisible(false), 150)
  }, [])

  const handleCardEnter = useCallback(() => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null }
  }, [])

  const handleCardLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setVisible(false), 150)
  }, [])

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (enterTimer.current) clearTimeout(enterTimer.current)
      if (leaveTimer.current) clearTimeout(leaveTimer.current)
    }
  }, [])

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className={cn('inline-flex', triggerClassName)}
      >
        {trigger}
      </div>

      {mounted && visible && createPortal(
        <div
          ref={cardRef}
          role="tooltip"
          onMouseEnter={handleCardEnter}
          onMouseLeave={handleCardLeave}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 50000,
            maxWidth: CARD_MAX_W,
            opacity: position ? 1 : 0,
          }}
          className={cn(
            'rounded-xl border border-border/60 bg-card/95 backdrop-blur-xl',
            'shadow-2xl shadow-black/30 ring-1 ring-white/5',
            'transition-opacity duration-150 ease-out',
            'text-sm text-foreground',
            className,
          )}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  )
}
