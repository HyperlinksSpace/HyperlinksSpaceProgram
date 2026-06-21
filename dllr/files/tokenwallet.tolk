// Jetton Wallet Extended (Tolk 1.0)
#include "tolk/stdlib.tolk"

const op::transfer = 0xf8a7ea5;
const op::internal_transfer = 0x178d4519;
const op::set_allowance = 0x5e7a110c;

const error::unauthorized = 73;
const error::insufficient_balance = 706;
const error::insufficient_allowance = 708;

global balance: int;
global allowance_balance: int;
global owner_address: slice;
global jetton_master_address: slice;

fun load_data() {
    var ds = get_storage_data().begin_parse();
    balance = ds.load_coins();
    allowance_balance = ds.load_coins();
    owner_address = ds.load_msg_addr();
    jetton_master_address = ds.load_msg_addr();
}

fun save_data() {
    set_storage_data(begin_cell()
        .store_coins(balance)
        .store_coins(allowance_balance)
        .store_msg_addr(owner_address)
        .store_msg_addr(jetton_master_address)
        .end_cell());
}

fun calculate_jetton_wallet_address(owner_address: slice, master_address: slice, code: cell): slice {
    var state_init = begin_cell()
        .store_uint(0, 2)
        .store_maybe_ref(code)
        .store_maybe_ref(begin_cell().store_coins(0).store_coins(0).store_msg_addr(owner_address).store_msg_addr(master_address).end_cell())
        .end_cell();
    return begin_cell().store_uint(4, 3).store_int(0, 8).store_uint(cell_hash(state_init), 256).end_cell().begin_parse();
}

fun on_internal_message(msg_value: int, in_msg_full: cell, in_msg_body: slice) {
    if (in_msg_body.slice_empty?()) { return; }
    var cs = in_msg_full.begin_parse();
    var flags = cs.load_uint(4);
    if (flags & 1) { return; }
    var sender_address = cs.load_msg_addr();

    load_data();
    var op = in_msg_body.load_uint(32);
    var query_id = in_msg_body.load_uint(64);

    if (op == op::transfer) {
        if (!equal_slices(sender_address, owner_address)) { throw error::unauthorized; }
        var jetton_amount = in_msg_body.load_coins();
        var to_owner_address = in_msg_body.load_msg_addr();
        
        if (jetton_amount > allowance_balance) { throw error::insufficient_allowance; }
        if (jetton_amount > balance) { throw error::insufficient_balance; }

        balance -= jetton_amount;
        allowance_balance -= jetton_amount;
        save_data();

        var to_jetton_wallet = calculate_jetton_wallet_address(to_owner_address, jetton_master_address, get_my_code());
        var msg = begin_cell()
            .store_uint(0x18, 6)
            .store_msg_addr(to_jetton_wallet)
            .store_coins(0)
            .store_uint(1, 1 + 4 + 4 + 64 + 32 + 1 + 1)
            .store_uint(op::internal_transfer, 32)
            .store_uint(query_id, 64)
            .store_coins(jetton_amount)
            .store_slice(in_msg_body);
        send_raw_message(msg.end_cell(), 64);
        return;
    }

    if (op == op::internal_transfer) {
        var jetton_amount = in_msg_body.load_coins();
        var from_owner_address = in_msg_body.load_msg_addr();
        var expected_wallet = calculate_jetton_wallet_address(from_owner_address, jetton_master_address, get_my_code());
        
        if (!equal_slices(sender_address, jetton_master_address) && !equal_slices(sender_address, expected_wallet)) {
            throw error::unauthorized;
        }

        balance += jetton_amount;
        save_data();
        return;
    }

    if (op == op::set_allowance) {
        if (!equal_slices(sender_address, jetton_master_address)) { throw error::unauthorized; }
        allowance_balance = in_msg_body.load_coins();
        save_data();
        return;
    }
}

get fun get_wallet_data() {
    load_data();
    return [balance, owner_address, jetton_master_address, get_my_code()];
}
