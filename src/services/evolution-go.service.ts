const BASE_URL = process.env.EVOLUTION_API_URL || 'http://127.0.0.1:8080';
const API_KEY = process.env.EVOLUTION_API_KEY;

const headers = () => ({
  'Content-Type': 'application/json',
  'apikey': API_KEY || '',
});

export async function createAndConnectInstance(instanceName: string, phoneNumber?: string) {
  try {
    // 1. Tenta criar a instância. Se já existir, a v2 vai dar erro, e nós ignoramos.
    await fetch(`${BASE_URL}/instance/create`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        instanceName: instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS"
      }),
    });

    // 2. Aguarda a instância estabilizar no Docker
    await new Promise(resolve => setTimeout(resolve, 2500));

    // 3. Busca o QR Code ou Pairing Code
    const connectUrl = phoneNumber
      ? `${BASE_URL}/instance/connect/${instanceName}?number=${phoneNumber.replace(/\D/g, '')}`
      : `${BASE_URL}/instance/connect/${instanceName}`;

    const res = await fetch(connectUrl, { headers: headers() });

    if (!res.ok) {
      // Se der erro aqui, a instância pode estar conectada. Vamos checar.
      const stateRes = await fetch(`${BASE_URL}/instance/connectionState/${instanceName}`, { headers: headers() });
      const stateData = await stateRes.json();
      if (stateData.instance?.state === 'open') {
        return { ok: true, action: 'already_connected' };
      }
      return { ok: false, error: 'no_qr_returned' };
    }

    const data = await res.json();

    return {
      ok: true,
      action: data.instance?.state === 'open' ? 'already_connected' : 'created',
      qrcode: data.base64 || data.code || null,
      pairingCode: data.pairingCode || null
    };

  } catch (error) {
    console.error('[evolution] Erro interno:', error);
    return { ok: false, error: 'evolution_unresponsive' };
  }
}

// Corrigido para o nome que o seu route.ts espera
export async function deleteInstance(instanceName: string): Promise<{
  ok: boolean
  alreadyGone?: boolean
  error?: string
  detail?: string
}> {
  try {
    const res = await fetch(`${BASE_URL}/instance/delete/${instanceName}`, {
      method: 'DELETE',
      headers: headers(),
    })

    if (res.ok) return { ok: true }

    // 404 = instance didn't exist; 401 = can't access (treat both as already gone)
    if (res.status === 404 || res.status === 401) return { ok: true, alreadyGone: true }

    const text = await res.text().catch(() => '')
    return { ok: false, error: 'delete_failed', detail: `HTTP ${res.status}: ${text}` }
  } catch (err) {
    return { ok: false, error: 'evolution_unresponsive', detail: String(err) }
  }
}