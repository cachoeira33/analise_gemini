import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?:         React.ReactNode
  rightIcon?:        React.ReactNode
  wrapperClassName?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ leftIcon, rightIcon, wrapperClassName, className, ...props }, ref) => {
    const hasLeft  = Boolean(leftIcon)
    const hasRight = Boolean(rightIcon)

    const input = (
      <input
        ref={ref}
        className={cn(
          'input-dark',
          hasLeft  && 'pl-10',
          hasRight && 'pr-10',
          className,
        )}
        {...props}
      />
    )

    if (!hasLeft && !hasRight) return input

    return (
      <div className={cn('relative', wrapperClassName)}>
        {hasLeft && (
          // pointer-events-none so clicks pass through to the input
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {leftIcon}
          </span>
        )}
        {input}
        {hasRight && (
          // NOTE: Do NOT add pointer-events-none here — rightIcon may contain
          // interactive elements (e.g. the password eye-toggle button).
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {rightIcon}
          </span>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'

export { Input }
