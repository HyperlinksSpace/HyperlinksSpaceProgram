import "types"

/// Gram (TON) controller, close to a wallet.
/// Deploy it, then set this contract's address as the admin of other contracts.
/// Handing the project off means TransferOwner — dependents keep this address.
contract Owner {
    author: "Hyperlinks Space Program"
    version: "1.0.0"
    description: "Wallet-like owner. Transfer the controller wallet to hand off every contract that points here."
    storage: Storage
    incomingMessages: AllowedMessage
}

type AllowedMessage =
    | TransferOwner
    | UpdateDetails
    | SendFromOwner

/// Leave enough for storage and a later action after a partial send.
const MIN_RESERVE = ton("0.05")

fun onInternalMessage(in: InMessage) {
    // Plain Ton transfers and text comments fund the contract, as they do a wallet.
    if (in.body.isEmpty() || in.body.remainingBitsCount() < 32 || in.body.preloadUint(32) == 0) {
        return;
    }

    val msg = lazy AllowedMessage.fromSlice(in.body);
    match (msg) {
        TransferOwner => {
            var storage = lazy Storage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            assert (msg.newOwner != contract.getAddress()) throw Errors.InvalidMessage;

            storage.owner = msg.newOwner;
            storage.save();
        }
        UpdateDetails => {
            var storage = lazy Storage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;

            storage.title = msg.title;
            storage.text = msg.text;
            storage.save();
        }
        SendFromOwner => {
            val storage = lazy Storage.load();
            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;
            sendAsOwner(msg);
        }
        else => {
            // Unknown bodies still deposit their Ton. A wallet does not bounce those.
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {}

/// Modes a controller may set. Destroy (+32) and carry-remaining-inbound (+64)
/// are rejected so a send cannot delete this Owner or silently attach extra Ton.
fun isAllowedSendMode(mode: uint8): bool {
    val bits = mode as int;
    val allowed = SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS |
    SEND_MODE_CARRY_ALL_BALANCE;
    return (bits & ~allowed) == 0;
}

fun sendAsOwner(msg: SendFromOwner) {
    assert (isAllowedSendMode(msg.sendMode)) throw Errors.InvalidMessage;

    val balance = contract.getOriginalBalance();
    val carriesAll = (msg.sendMode as int & SEND_MODE_CARRY_ALL_BALANCE) != 0;
    if (carriesAll) {
        assert (balance > MIN_RESERVE) throw Errors.NotEnoughBalance;
    } else {
        assert (msg.tonAmount > 0) throw Errors.InvalidMessage;
        assert (balance > msg.tonAmount + MIN_RESERVE) throw Errors.NotEnoughBalance;
    }

    val bounce = msg.bounce ? BounceMode.Only256BitsOfBody : BounceMode.NoBounce;
    val payload = msg.body.beginParse();
    if (payload.isEmpty()) {
        val out = createMessage({
            bounce,
            dest: msg.dest,
            value: msg.tonAmount,
        });
        out.send(msg.sendMode as int);
        return;
    }

    val out = createMessage({
        bounce,
        dest: msg.dest,
        value: msg.tonAmount,
        body: msg.body,
    });
    out.send(msg.sendMode as int);
}

get fun owner(): address {
    val storage = lazy Storage.load();
    return storage.owner;
}

get fun title(): string {
    val storage = lazy Storage.load();
    return storage.title;
}

get fun text(): string {
    val storage = lazy Storage.load();
    return storage.text;
}
