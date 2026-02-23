import type { WSMessage } from '../types'

type MessageHandler = (msg: WSMessage) => void
type StatusHandler = (connected: boolean) => void

export class WSClient {
  private ws: WebSocket | null = null
  private onMessage: MessageHandler
  private onStatus: StatusHandler
  private reconnectDelay = 1000
  private maxDelay = 30000
  private dead = false

  constructor(onMessage: MessageHandler, onStatus: StatusHandler) {
    this.onMessage = onMessage
    this.onStatus = onStatus
  }

  connect() {
    if (this.dead) return
    const token = localStorage.getItem('ctopia_token')
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/ws${token ? `?token=${token}` : ''}`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.reconnectDelay = 1000
      this.onStatus(true)
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage
        this.onMessage(msg)
      } catch {
        // ignore malformed messages
      }
    }

    this.ws.onclose = () => {
      this.onStatus(false)
      if (!this.dead) {
        setTimeout(() => this.connect(), this.reconnectDelay)
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxDelay)
      }
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  disconnect() {
    this.dead = true
    this.ws?.close()
  }
}
