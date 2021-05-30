import { useState, useEffect, useCallback } from 'react'
import {
  STATUS_CONNECTION_ERROR,
  STATUS_CONNECTION_HEALTHY,
  STATUS_CONNECTION_WARNING,
} from './connection-statuses'
import { web3Providers } from '../../environment'
import { pollEvery } from '../../utils'
import { useWallet } from '../../wallet'
import { getWeb3, getLatestBlockTimestamp } from '../../web3-utils'

const BLOCK_TIMESTAMP_POLL_INTERVAL = 60000

export function useSyncInfo(wantedWeb3 = 'default') {
  const wallet = useWallet()
  const clientWeb3 = getWeb3(web3Providers.default)
  const walletWeb3 = wallet.web3
  const selectedWeb3 = wantedWeb3 === 'wallet' ? walletWeb3 : clientWeb3

  const [isListening, setIsListening] = useState(true)
  const [isOnline, setIsOnline] = useState(window.navigator.onLine)
  const [connectionStatus, setConnectionStatus] = useState(
    STATUS_CONNECTION_HEALTHY
  )
  const [syncDelay, setSyncDelay] = useState(0)

  const handleWebsocketDrop = useCallback(() => {
    setIsListening(false)
    setConnectionStatus(STATUS_CONNECTION_ERROR)
  }, [])

  // listen to web3 connection drop due to inactivity
  useEffect(() => {
    if (!selectedWeb3 || !selectedWeb3.currentProvider) {
      return
    }

    if (selectedWeb3.currentProvider.on) {
      selectedWeb3.currentProvider.on('end', handleWebsocketDrop)
      selectedWeb3.currentProvider.on('error', handleWebsocketDrop)
    }

    return () => {
      if (selectedWeb3.currentProvider.removeEventListener) {
        selectedWeb3.currentProvider.removeListener('end', handleWebsocketDrop)
        selectedWeb3.currentProvider.removeListener(
          'error',
          handleWebsocketDrop
        )
      }
    }
  }, [selectedWeb3, handleWebsocketDrop])

  // check for connection loss from the browser
  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => {
      setIsOnline(false)
      setConnectionStatus(STATUS_CONNECTION_ERROR)
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // listen for connection status with block timestamps
  useEffect(() => {
    if (!selectedWeb3) {
      return
    }

    const pollBlockTimestamp = pollEvery(
      () => ({
        request: () => getLatestBlockTimestamp(selectedWeb3),
        onResult: timestamp => {
          const blockDiff = new Date() - timestamp
          const latestBlockDifference = Math.floor(blockDiff / 1000 / 60)
          const connectionHealth =
            latestBlockDifference >= 30
              ? STATUS_CONNECTION_ERROR
              : latestBlockDifference >= 3
              ? STATUS_CONNECTION_WARNING
              : STATUS_CONNECTION_HEALTHY
          setConnectionStatus(connectionHealth)
          setSyncDelay(latestBlockDifference)
        },
      }),
      BLOCK_TIMESTAMP_POLL_INTERVAL
    )
    const cleanUpTimestampPoll = pollBlockTimestamp()

    return () => cleanUpTimestampPoll()
  }, [selectedWeb3])

  return {
    connectionStatus,
    isListening,
    isOnline,
    syncDelay,
  }
}
