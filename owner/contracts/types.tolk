enum Errors {
    NotOwner = 100
    NotEnoughBalance = 101
    InvalidMessage = 102
}

/// Stable admin identity. `title` and `text` are snake-encoded UTF-8 cells
/// (Tolk `string`): short text sits in one cell, longer text chains refs.
struct Storage {
    owner: address
    title: string
    text: string
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.save(self) {
    contract.setData(self.toCell());
}

/// Replace the wallet that may act through this contract.
/// Contracts that store this Owner address as their admin stay pointed here.
struct (0x4f574e01) TransferOwner {
    queryId: uint64
    newOwner: address
}

/// Replace the on-chain title and text collected by the Owner form.
struct (0x4f574e02) UpdateDetails {
    queryId: uint64
    title: string
    text: string
}

/// Wallet-like send. The outgoing message is sent from this contract,
/// so the receiver sees the Owner address as the sender.
struct (0x4f574e03) SendFromOwner {
    queryId: uint64
    dest: address
    tonAmount: coins
    bounce: bool
    sendMode: uint8
    /// Opaque body forwarded as the outgoing message body. An empty cell sends no body.
    body: cell
}
