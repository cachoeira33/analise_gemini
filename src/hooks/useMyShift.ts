'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useAuthUser } from '@/components/providers/AuthUserProvider'
import { isUserOnShift, type ShiftData } from '@/services/shifts/enforcement'

export function useMyShift() {
    const sb = useMemo(() => createClient(), [])
    const { businessId, memberRole } = useTenant()
    const { user } = useAuthUser()
    const [shift, setShift] = useState<ShiftData | null>(null)
    const [loading, setLoading] = useState(true)

    const isOnShift = useMemo(() => {
        // Owners and Managers are NEVER blocked by shifts
        if (memberRole === 'owner' || memberRole === 'manager') return true
        
        // Employees are blocked if they don't have a shift or it's outside hours
        return isUserOnShift(shift)
    }, [shift, memberRole])

    useEffect(() => {
        if (!businessId || !user?.id) {
            setLoading(false)
            return
        }

        // Owners and Managers don't need to fetch a shift record
        if (memberRole === 'owner' || memberRole === 'manager') {
            setLoading(false)
            return
        }

        async function fetchShift() {
            const { data, error } = await sb
                .from('employee_shifts')
                .select('start_time, end_time, days_of_week, is_active')
                .eq('business_id', businessId)
                .eq('user_id', user!.id)
                .maybeSingle() // Use maybeSingle to avoid 406 error on empty

            if (!error && data) {
                setShift(data as ShiftData)
            }
            setLoading(false)
        }

        fetchShift()
    }, [businessId, user?.id, memberRole, sb])

    return { shift, isOnShift, loading, memberRole }
}
