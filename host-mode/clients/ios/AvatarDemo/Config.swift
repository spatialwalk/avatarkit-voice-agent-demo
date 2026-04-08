import Foundation

enum Config {
    /// Host backend base URL — auto-configured by start.sh
    /// Simulator: localhost. Physical device: LAN IP.
    static let hostServerURL = "http://192.168.1.185:8765"
}
