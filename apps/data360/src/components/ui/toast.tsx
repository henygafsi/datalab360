import * as React from "react"

export type ToastProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  variant?: "default" | "destructive"
}

export type ToastActionElement = React.ReactElement

export interface Toast extends ToastProps {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}
