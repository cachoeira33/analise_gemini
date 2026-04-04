'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  MessageSquare, RefreshCw, Loader2, Trash2, Smartphone,
  Wifi, WifiOff, Send, Users, Clock, Zap, QrCode, Lock,
  Bot, Plus, Pencil, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/hooks/useTranslation'
import { useSubscription } from '@/hooks/useSubscription'
import { useTenant } from '@/hooks/useTenant'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────────

type ConnectionState = 'checking' | 'open' | 'disconnected' | 'error'
type InitStatus = 'idle' | 'step1' | 'step2' | 'success' | 'error'
type ResetStatus = 'idle' | 'resetting' | 'done' | 'error'
type PageTab = 'connection' | 'automations'
type TriggerType = 'before_due' | 'on_due' | 'after_due'

interface StatusResult {
  ok: boolean
  state?: string
  connected?: boolean
  instance?: string
  error?: string
  hint?: string
}

interface InitResult {
  ok: boolean
  action?: 'already_exists_connected' | 'created' | 'already_connected' | string
  qrcode?: string | null
  pairingCode?: string | null
  retryAfter?: number
  error?: 'evolution_unresponsive' | 'connect_failed' | 'env_missing' | 'create_error' | string
  hint?: string
  detail?: unknown
}

interface Analytics {
  messagesSent: number
  uniqueRecipients: number
  lastMessageAt: string | null
}

interface Automation {
  id: string
  trigger_type: TriggerType
  days_offset: number
  message_template: string
  is_active: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)
}

function buildInstanceName(businessId: string | null, businessName: string | null): string {
  if (!businessId) return ''
  const last4 = businessId.replace(/-/g, '').slice(-4)
  if (businessName) return `myvizo-${slugify(businessName)}-${last4}`
  return `myvizo-${last4}`
}

// ── Animated Counter ───────────────────────────────────────────────────────────

function AnimatedCounter({ value, label, icon: Icon, color }: {
  value: number
  label: string
  icon: React.ElementType
  color: string
}) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (value === 0) { setDisplay(0); return }
    const duration = 800
    const steps = 30
    const increment = value / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= value) { setDisplay(value); clearInterval(timer) }
      else setDisplay(Math.floor(current))
    }, duration / steps)
    return () => clearInterval(timer)
  }, [value])

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-5 flex items-start gap-4 shadow-lg shadow-black/10 hover:border-primary/20 transition-colors">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{display.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Upgrade Required Gate ──────────────────────────────────────────────────────

function UpgradeRequired({ t }: { t: (k: string) => string }) {
  return (
    <div className="p-6 md:p-8 w-full max-w-3xl">
      <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-10 flex flex-col items-center gap-6 shadow-lg text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">{t('whatsapp_admin.upgrade_title')}</h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">{t('whatsapp_admin.upgrade_desc')}</p>
        </div>
        <a
          href="/dashboard/billing"
          className="inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 transition-all"
        >
          {t('whatsapp_admin.upgrade_cta')}
        </a>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WhatsAppAdminPage() {
  const { t } = useTranslation()
  const subscription = useSubscription()
  const tenant = useTenant()

  // ── Instance name with manual override support ──────────────────────────────
  // If the admin has stored a manual override in localStorage, use it; otherwise
  // fall back to the generated name (myvizo-{slug}-{last4}).
  const LS_KEY = 'whatsapp_instance_override'
  const [instanceOverride, setInstanceOverride] = useState<string>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem(LS_KEY) ?? ''
    return ''
  })
  const instanceName = instanceOverride.trim() || buildInstanceName(tenant.businessId, tenant.businessName)

  function saveInstanceOverride(val: string) {
    setInstanceOverride(val)
    if (val.trim()) {
      localStorage.setItem(LS_KEY, val.trim())
    } else {
      localStorage.removeItem(LS_KEY)
    }
  }

  // ── Tab state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<PageTab>('connection')

  // ── Connection state ────────────────────────────────────────────────────────
  const [connState, setConnState] = useState<ConnectionState>('checking')
  const [initStatus, setInitStatus] = useState<InitStatus>('idle')
  const [initResult, setInitResult] = useState<InitResult | null>(null)
  const [resetStatus, setResetStatus] = useState<ResetStatus>('idle')
  const [phoneInput, setPhoneInput] = useState('')
  const [analytics, setAnalytics] = useState<Analytics>({ messagesSent: 0, uniqueRecipients: 0, lastMessageAt: null })
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Automations state ───────────────────────────────────────────────────────
  const [automations, setAutomations] = useState<Automation[]>([])
  const [automLoading, setAutomLoading] = useState(false)
  const [editingAutom, setEditingAutom] = useState<Partial<Automation> | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Auto-Check: Instance status ─────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    if (!instanceName) return
    setConnState('checking')
    try {
      const res = await fetch(`/api/admin/whatsapp/status?instance=${encodeURIComponent(instanceName)}`)
      const data = await res.json() as StatusResult
      if (data.ok && data.connected) {
        setConnState('open')
      } else if (data.ok && !data.connected) {
        setConnState('disconnected')
      } else {
        setConnState(data.error === 'not_found' ? 'disconnected' : 'error')
      }
    } catch {
      setConnState('error')
    }
  }, [instanceName])

  // ── Load analytics ───────────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    try {
      const res = await fetch('/api/admin/whatsapp/analytics')
      const data = await res.json() as Analytics
      setAnalytics(data)
    } catch { /* silent */ }
    setAnalyticsLoading(false)
  }, [])

  // ── Load automations ─────────────────────────────────────────────────────────
  const loadAutomations = useCallback(async () => {
    if (!tenant.businessId) return
    setAutomLoading(true)
    const sb = createClient()
    const { data, error } = await sb
      .from('whatsapp_automations')
      .select('id, trigger_type, days_offset, message_template, is_active')
      .eq('business_id', tenant.businessId)
      .order('trigger_type')
      .order('days_offset')
    if (!error) setAutomations((data ?? []) as Automation[])
    setAutomLoading(false)
  }, [tenant.businessId])

  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    void checkStatus()
    void loadAnalytics()
  }, [checkStatus, loadAnalytics])

  useEffect(() => {
    if (activeTab === 'automations') void loadAutomations()
  }, [activeTab, loadAutomations])

  // ── Instance connect ──────────────────────────────────────────────────────────
  async function handleConnect() {
    setInitStatus('step1')
    setInitResult(null)
    stepTimerRef.current = setTimeout(() => setInitStatus('step2'), 3_000)

    try {
      const body: Record<string, string> = { instanceName }
      if (phoneInput.trim()) body.phoneNumber = phoneInput.trim()

      const res = await fetch('/api/admin/whatsapp/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as InitResult
      clearTimeout(stepTimerRef.current ?? undefined)
      setInitResult(data)
      setInitStatus(data.ok ? 'success' : 'error')

      if (data.ok) {
        void checkStatus()

        if (data.retryAfter && !data.qrcode && !data.pairingCode) {
          toast.info(t('whatsapp_admin.instance_starting'), {
            description: t('whatsapp_admin.fetching_qr', { seconds: String(data.retryAfter) }),
          })
          setTimeout(() => { void handleConnect() }, data.retryAfter * 1_000)
          return
        }

        const desc = data.pairingCode
          ? t('whatsapp_admin.enter_code_hint')
          : data.qrcode
            ? t('whatsapp_admin.scan_qr_hint')
            : t('whatsapp_admin.connected_hint')
        toast.success(
          data.action === 'created' ? t('whatsapp_admin.instance_created')
            : data.action === 'already_connected' ? t('whatsapp_admin.already_connected')
              : t('whatsapp_admin.instance_reconnected'),
          { description: desc },
        )
      } else {
        toast.error(t('whatsapp_admin.init_failed'), {
          description: data.hint ?? data.error ?? 'Unknown error',
        })
      }
    } catch (err) {
      clearTimeout(stepTimerRef.current ?? undefined)
      setInitResult({ ok: false, error: 'network_error' })
      setInitStatus('error')
      toast.error(t('whatsapp_admin.network_error'), { description: String(err) })
    }
  }

  // ── Instance reset ────────────────────────────────────────────────────────────
  async function handleReset() {
    setResetStatus('resetting')
    setInitResult(null)
    setInitStatus('idle')
    try {
      const res = await fetch(`/api/admin/whatsapp/reset?instance=${encodeURIComponent(instanceName)}`, { method: 'DELETE' })
      const data = await res.json() as { ok: boolean; error?: string }
      if (data.ok) {
        setResetStatus('done')
        void checkStatus()
        toast.success(t('whatsapp_admin.reset_success'))
      } else {
        setResetStatus('error')
        toast.error(t('whatsapp_admin.reset_failed'), { description: data.error ?? 'Unknown error' })
      }
    } catch (err) {
      setResetStatus('error')
      toast.error(t('whatsapp_admin.network_error'), { description: String(err) })
    }
  }

  // ── Save automation ────────────────────────────────────────────────────────────
  async function handleSaveAutomation() {
    if (!editingAutom || !tenant.businessId) return
    if (!editingAutom.message_template?.trim()) {
      toast.error(t('whatsapp_admin.automation_template_required'))
      return
    }
    setSaving(true)
    const sb = createClient()

    const payload = {
      business_id:      tenant.businessId,
      trigger_type:     editingAutom.trigger_type ?? 'before_due',
      days_offset:      editingAutom.days_offset ?? 1,
      message_template: editingAutom.message_template.trim(),
      is_active:        editingAutom.is_active ?? true,
    }

    const { error } = editingAutom.id
      ? await sb.from('whatsapp_automations').update(payload).eq('id', editingAutom.id)
      : await sb.from('whatsapp_automations').insert(payload)

    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success(t('whatsapp_admin.automation_saved'))
    setEditingAutom(null)
    void loadAutomations()
    setSaving(false)
  }

  // ── Delete automation ──────────────────────────────────────────────────────────
  async function handleDeleteAutomation(id: string) {
    const sb = createClient()
    const { error } = await sb.from('whatsapp_automations').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success(t('whatsapp_admin.automation_deleted'))
    void loadAutomations()
  }

  const isLoading = initStatus === 'step1' || initStatus === 'step2'
  const isResetting = resetStatus === 'resetting'
  const isPairingMode = !!phoneInput.trim()

  function successLabel(r: InitResult): string {
    if (r.action === 'already_connected') return t('whatsapp_admin.already_connected_desc')
    if (r.pairingCode) return t('whatsapp_admin.pairing_code_desc')
    if (r.qrcode) return r.action === 'created' ? t('whatsapp_admin.instance_created_qr') : t('whatsapp_admin.instance_exists_qr')
    return t('whatsapp_admin.done')
  }

  function errorLabel(r: InitResult): string {
    if (r.hint) return r.hint
    if (r.error === 'evolution_unresponsive') return t('whatsapp_admin.evolution_unresponsive')
    if (r.error === 'env_missing') return t('whatsapp_admin.env_missing')
    return `${t('whatsapp_admin.error_prefix')}: ${r.error ?? 'unknown'}`
  }

  function triggerLabel(type: TriggerType): string {
    if (type === 'before_due') return t('whatsapp_admin.automation_trigger_before')
    if (type === 'on_due') return t('whatsapp_admin.automation_trigger_on')
    return t('whatsapp_admin.automation_trigger_after')
  }

  // ── Tier & Loading Gates ──────────────────────────────────────────────────────
  if (subscription.isLoading || tenant.isLoading) {
    return (
      <div className="p-6 md:p-8 w-full max-w-3xl flex items-center justify-center min-h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (subscription.planKey === 'freemium') {
    return <UpgradeRequired t={t} />
  }

  const lastMsgFormatted = analytics.lastMessageAt
    ? new Date(analytics.lastMessageAt).toLocaleString()
    : '—'

  return (
    <div className="p-6 md:p-8 w-full max-w-3xl space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
          <MessageSquare className="h-6 w-6 text-indigo-400" />
          {t('whatsapp_admin.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('whatsapp_admin.subtitle')}
        </p>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 rounded-xl bg-muted/60 p-1 w-fit">
        {(['connection', 'automations'] as PageTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              activeTab === tab
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab === 'connection' ? <Wifi className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            {t(`whatsapp_admin.tab_${tab}`)}
          </button>
        ))}
      </div>

      {/* ══════════════════════ CONNECTION TAB ══════════════════════ */}
      {activeTab === 'connection' && (
        <>
          {/* ── Connection Status Card ── */}
          <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-4 shadow-lg shadow-black/10">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{t('whatsapp_admin.status_title')}</p>
              <button
                onClick={() => { void checkStatus(); void loadAnalytics() }}
                disabled={connState === 'checking'}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3 w-3', connState === 'checking' && 'animate-spin')} />
                {t('whatsapp_admin.refresh')}
              </button>
            </div>

            <div className={cn(
              'flex items-center gap-4 rounded-xl border px-5 py-4 transition-all duration-500',
              connState === 'open'         && 'border-emerald-500/30 bg-emerald-500/5',
              connState === 'disconnected' && 'border-amber-500/30   bg-amber-500/5',
              connState === 'error'        && 'border-rose-500/30    bg-rose-500/5',
              connState === 'checking'     && 'border-border         bg-muted/40',
            )}>
              <div className="shrink-0">
                {connState === 'open' && (
                  <div className="relative">
                    <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-emerald-400 opacity-40" />
                    <Wifi className="relative h-5 w-5 text-emerald-400" />
                  </div>
                )}
                {connState === 'disconnected' && <WifiOff className="h-5 w-5 text-amber-400" />}
                {connState === 'error'        && <WifiOff className="h-5 w-5 text-rose-400" />}
                {connState === 'checking'     && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className={cn(
                    'text-sm font-bold',
                    connState === 'open'         && 'text-emerald-400',
                    connState === 'disconnected' && 'text-amber-400',
                    connState === 'error'        && 'text-rose-400',
                    connState === 'checking'     && 'text-muted-foreground',
                  )}>
                    {connState === 'checking'     ? t('whatsapp_admin.checking')
                      : connState === 'open'      ? t('whatsapp_admin.connected')
                        : connState === 'disconnected' ? t('whatsapp_admin.disconnected')
                          : t('whatsapp_admin.unreachable')}
                  </p>
                  {connState === 'open' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {t('whatsapp_admin.badge_connected')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-xs text-muted-foreground">
                    {t('whatsapp_admin.instance_label')}: <code className="bg-muted px-1 rounded text-xs">{instanceName}</code>
                  </p>
                  <input
                    type="text"
                    value={instanceOverride}
                    onInput={function(this: HTMLInputElement) { saveInstanceOverride(this.value) }}
                    placeholder={t('whatsapp_admin.instance_override_placeholder') || 'Override instance name…'}
                    className="rounded border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-44"
                  />
                </div>
              </div>

              {connState === 'open' && (
                <button
                  onClick={handleReset}
                  disabled={isResetting}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                >
                  {isResetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {t('whatsapp_admin.disconnect_btn')}
                </button>
              )}
            </div>
          </div>

          {/* ── Analytics Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <AnimatedCounter
              value={analytics.messagesSent}
              label={t('whatsapp_admin.stat_messages_sent')}
              icon={Send}
              color="bg-indigo-500"
            />
            <AnimatedCounter
              value={analytics.uniqueRecipients}
              label={t('whatsapp_admin.stat_unique_recipients')}
              icon={Users}
              color="bg-violet-500"
            />
            <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-5 flex items-start gap-4 shadow-lg shadow-black/10 hover:border-primary/20 transition-colors">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-amber-500">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{analyticsLoading ? '…' : lastMsgFormatted}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('whatsapp_admin.stat_last_message')}</p>
              </div>
            </div>
          </div>

          {/* ── Connect Panel (shown when disconnected) ── */}
          {connState !== 'open' && (
            <div className="rounded-xl border border-white/10 bg-card/50 backdrop-blur-md p-6 space-y-5 shadow-xl shadow-black/20">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-indigo-400" />
                  <p className="text-sm font-semibold text-foreground">{t('whatsapp_admin.connect_title')}</p>
                </div>
                <p className="text-xs text-muted-foreground">{t('whatsapp_admin.connect_desc')}</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="phone-input" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Smartphone className="h-3.5 w-3.5" />
                  {t('whatsapp_admin.phone_label')}
                  <span className="text-muted-foreground/50">({t('whatsapp_admin.phone_hint')})</span>
                </label>
                <input
                  id="phone-input"
                  type="tel"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  placeholder="+44 7700 900123"
                  disabled={isLoading || isResetting}
                  className={cn(
                    'w-full rounded-lg border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50',
                    'disabled:opacity-50 transition-colors',
                    isPairingMode ? 'border-indigo-500/40' : 'border-border',
                  )}
                />
                {isPairingMode && (
                  <p className="text-[11px] text-indigo-400">{t('whatsapp_admin.pairing_mode_hint')}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleConnect}
                  disabled={isLoading || isResetting}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all',
                    'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                  )}
                >
                  {isLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('whatsapp_admin.connecting')}</>
                    : isPairingMode
                      ? <><Smartphone className="h-4 w-4" /> {t('whatsapp_admin.get_pairing_code')}</>
                      : <><Zap className="h-4 w-4" /> {t('whatsapp_admin.connect_qr_btn')}</>
                  }
                </button>

                <button
                  onClick={handleReset}
                  disabled={isLoading || isResetting}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all',
                    'border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 active:scale-95',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                  )}
                  title={t('whatsapp_admin.reset_title')}
                >
                  {isResetting
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('whatsapp_admin.resetting')}</>
                    : <><Trash2 className="h-4 w-4" /> {t('whatsapp_admin.reset_btn')}</>
                  }
                </button>
              </div>

              {isLoading && (
                <div className="w-48 h-48 rounded-lg border border-indigo-500/20 bg-indigo-500/5 animate-pulse flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-indigo-400/40 animate-spin" />
                </div>
              )}

              {initResult && !isLoading && (
                <div className={cn(
                  'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
                  initResult.ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/30    bg-rose-500/10    text-rose-300',
                )}>
                  <div className="space-y-3 min-w-0 w-full">
                    <p className="font-medium">
                      {initResult.ok ? successLabel(initResult) : errorLabel(initResult)}
                    </p>

                    {initResult.ok && initResult.pairingCode && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-emerald-200">{t('whatsapp_admin.pairing_instructions')}</p>
                        <div className="flex items-center justify-center rounded-xl border border-emerald-500/30 bg-black/30 py-5">
                          <span className="font-mono text-4xl font-extrabold tracking-[0.3em] text-white select-all">
                            {initResult.pairingCode}
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-300/60 text-center">{t('whatsapp_admin.code_expires')}</p>
                      </div>
                    )}

                    {initResult.ok && initResult.qrcode && !initResult.pairingCode && (
                      <div className="pt-1">
                        <p className="text-xs font-semibold text-emerald-200 mb-2">{t('whatsapp_admin.scan_qr_label')}</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={
                            typeof initResult.qrcode === 'string' && initResult.qrcode.startsWith('data:')
                              ? initResult.qrcode
                              : `data:image/png;base64,${initResult.qrcode}`
                          }
                          alt="WhatsApp QR Code"
                          className="rounded-lg border border-emerald-500/30 w-64 h-64 object-contain bg-white mx-auto shadow-2xl"
                        />
                      </div>
                    )}

                    {initResult.ok && !initResult.qrcode && !initResult.pairingCode && (
                      <div className="flex flex-col items-center justify-center p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                        <div className="bg-emerald-500 p-3 rounded-full mb-3">
                          <MessageSquare className="text-white w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold text-emerald-400">{t('whatsapp_admin.connected_success')}</h3>
                        <p className="text-sm text-emerald-300/70">{t('whatsapp_admin.connected_success_desc')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Connected Info Panel ── */}
          {connState === 'open' && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md p-6 shadow-lg shadow-black/10">
              <div className="flex flex-col items-center justify-center py-4">
                <div className="bg-emerald-500 p-4 rounded-full mb-4 shadow-lg shadow-emerald-500/30">
                  <MessageSquare className="text-white w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-emerald-400 mb-1">{t('whatsapp_admin.connected_success')}</h3>
                <p className="text-sm text-emerald-300/70 text-center max-w-md">{t('whatsapp_admin.connected_success_desc')}</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════ AUTOMATIONS TAB ══════════════════════ */}
      {activeTab === 'automations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{t('whatsapp_admin.automations_title')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('whatsapp_admin.automations_desc')}</p>
            </div>
            {!editingAutom && (
              <button
                onClick={() => setEditingAutom({ trigger_type: 'before_due', days_offset: 1, message_template: '', is_active: true })}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('whatsapp_admin.automation_new_btn')}
              </button>
            )}
          </div>

          {/* ── Inline editor ── */}
          {editingAutom && (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Trigger type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('whatsapp_admin.automation_trigger_label')}</label>
                  <select
                    value={editingAutom.trigger_type ?? 'before_due'}
                    onChange={e => setEditingAutom(p => ({ ...p, trigger_type: e.target.value as TriggerType }))}
                    className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    <option value="before_due">{t('whatsapp_admin.automation_trigger_before')}</option>
                    <option value="on_due">{t('whatsapp_admin.automation_trigger_on')}</option>
                    <option value="after_due">{t('whatsapp_admin.automation_trigger_after')}</option>
                  </select>
                </div>

                {/* Days offset */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('whatsapp_admin.automation_days_label')}</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={editingAutom.days_offset ?? 1}
                    onChange={e => setEditingAutom(p => ({ ...p, days_offset: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    disabled={editingAutom.trigger_type === 'on_due'}
                  />
                </div>
              </div>

              {/* Message template */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t('whatsapp_admin.automation_template_label')}</label>
                <textarea
                  rows={5}
                  value={editingAutom.message_template ?? ''}
                  onChange={e => setEditingAutom(p => ({ ...p, message_template: e.target.value }))}
                  placeholder={`Hello {{customer_name}}, your payment of {{amount}} is due on {{due_date}}.`}
                  className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                />
                <p className="text-[11px] text-muted-foreground/70">{t('whatsapp_admin.automation_variables_hint')}</p>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAutom(p => ({ ...p, is_active: !p?.is_active }))}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                    editingAutom.is_active ? 'bg-indigo-500' : 'bg-muted',
                  )}
                >
                  <span className={cn(
                    'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transform transition-transform',
                    editingAutom.is_active ? 'translate-x-4' : 'translate-x-0',
                  )} />
                </button>
                <span className="text-xs text-muted-foreground">{t('whatsapp_admin.automation_active_label')}</span>
              </div>

              {/* Form actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleSaveAutomation}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {t('whatsapp_admin.automation_save_btn')}
                </button>
                <button
                  onClick={() => setEditingAutom(null)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold border border-border text-muted-foreground hover:bg-muted disabled:opacity-60 transition-colors"
                >
                  {t('whatsapp_admin.automation_cancel_btn')}
                </button>
              </div>
            </div>
          )}

          {/* ── Automations list ── */}
          {automLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : automations.length === 0 && !editingAutom ? (
            <div className="rounded-xl border border-dashed border-border p-10 flex flex-col items-center gap-3 text-center">
              <Bot className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t('whatsapp_admin.automation_empty')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {automations.map(a => (
                <div
                  key={a.id}
                  className={cn(
                    'rounded-xl border bg-card/60 p-4 flex items-start gap-4',
                    !a.is_active && 'opacity-60',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                        a.trigger_type === 'before_due' && 'bg-blue-500/20 text-blue-400',
                        a.trigger_type === 'on_due'     && 'bg-amber-500/20 text-amber-400',
                        a.trigger_type === 'after_due'  && 'bg-rose-500/20 text-rose-400',
                      )}>
                        {triggerLabel(a.trigger_type)}
                        {a.trigger_type !== 'on_due' && ` · ${a.days_offset}d`}
                      </span>
                      {!a.is_active && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {t('whatsapp_admin.automation_inactive')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{a.message_template}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingAutom(a)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteAutomation(a.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors text-muted-foreground hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
