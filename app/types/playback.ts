export interface UpnpTransportInfo {
  currentTransportState: string
  currentTransportStatus: string
  currentSpeed: string
}

export interface UpnpPositionInfo {
  track: number
  trackDuration: string
  trackMetaData?: string | null
  trackUri?: string | null
  relTime: string
  absTime: string
  relCount: number
  absCount: number
}
