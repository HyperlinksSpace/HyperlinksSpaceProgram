// Jetton Minter (Tolk 1.0)
#include "tolk/stdlib.tolk"

const op::mint = 21;
const op::set_allowance = 0x5e7a110c;
const op::internal_transfer = 0x178d4519;
const error::unauthorized = 73;

global total_supply: int;
global admin_address: slice;
global jetton_wallet_code: cell;
global metadata: cell;

fun load_data() {
    var ds = get_storage_data().begin_parse();
    total_supply = ds.load_coins();
    admin_address = ds.load_msg_addr();
    metadata = ds.load_ref();
    jetton_wallet_code = ds.load_ref();
}

fun save_data() {
    set_storage_data(begin_cell()
        .store_coins(total_supply)
        .store_msg_addr(admin_address)
        .store_ref(metadata)
        .store_ref(jetton_wallet_code)
        .end_cell());
}

fun calculate_user_jetton_wallet_address(owner_address: slice): slice {
    var state_init = begin_cell()
        .store_uint(0, 2)
        .store_maybe_ref(jetton_wallet_code)
        .store_maybe_ref(begin_cell()
            .store_coins(0)
            .store_coins(0)
            .store_msg_addr(owner_address)
            .store_msg_addr(get_my_address())
            .end_cell())
        .end_cell();
    
    var hash = cell_hash(state_init);
    return begin_cell()
        .store_uint(4, 3)
        .store_int(0, 8)
        .store_uint(hash, 256)
        .end_cell().begin_parse();
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

    if (!equal_slices(sender_address, admin_address)) {
        throw error::unauthorized;
    }

    if (op == op::mint) {
        var to_address = in_msg_body.load_msg_addr();
        var jetton_amount = in_msg_body.load_coins();
        var user_wallet = calculate_user_jetton_wallet_address(to_address);
        
        var msg = begin_cell()
            .store_uint(0x18, 6)
            .store_msg_addr(user_wallet)
            .store_coins(0)
            .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
            .store_uint(op::internal_transfer, 32)
            .store_uint(query_id, 64)
            .store_coins(jetton_amount)
            .store_msg_addr(admin_address)
            .store_msg_addr(admin_address)
            .store_coins(0)
            .store_uint(0, 1);

        send_raw_message(msg.end_cell(), 64);
        total_supply += jetton_amount;
        save_data();
        return;
    }

    if (op == op::set_allowance) {
        var target_user = in_msg_body.load_msg_addr();
        var allowance_amount = in_msg_body.load_coins();
        var user_wallet = calculate_user_jetton_wallet_address(target_user);

        var msg = begin_cell()
            .store_uint(0x18, 6)
            .store_msg_addr(user_wallet)
            .store_coins(0)
            .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
            .store_uint(op::set_allowance, 32)
            .store_uint(query_id, 64)
            .store_coins(allowance_amount)
            .end_cell();

        send_raw_message(msg, 64);
        return;
    }
}

get fun get_jetton_data() {
    load_data();
    return [total_supply, -1, admin_address, metadata, jetton_wallet_code];
}
