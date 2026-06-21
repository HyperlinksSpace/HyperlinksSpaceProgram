// Автономный временной замок до сентября (Tolk 1.0)
#include "tolk/stdlib.tolk"

global unlock_timestamp: int; // Время разлока (Unix Timestamp)
global beneficiary_address: slice; // Куда уйдут деньги после разлока
global jetton_wallet_address: slice; // Адрес Jetton Wallet этого контракта

fun load_data() {
    var ds = get_storage_data().begin_parse();
    unlock_timestamp = ds.load_uint(32);
    beneficiary_address = ds.load_msg_addr();
    jetton_wallet_address = ds.load_msg_addr();
}

fun on_internal_message(msg_value: int, in_msg_full: cell, in_msg_body: slice) {
    if (in_msg_body.slice_empty?()) { return; }
    
    var cs = in_msg_full.begin_parse();
    cs.load_uint(4); // flags
    var sender_address = cs.load_msg_addr();

    load_data();

    // Проверяем, наступил ли сентябрь (сравниваем текущее время TVM с unlock_timestamp)
    if (now() < unlock_timestamp) {
        throw 403; // Ошибка: Время разлока еще не пришло
    }

    // Забрать средства может только бенефициар проекта
    if (!equal_slices(sender_address, beneficiary_address)) {
        throw 73; // Unauthorized
    }

    var jetton_amount = in_msg_body.load_coins();

    // Формируем стандартную транзакцию отправки Jetton на кошелек бенефициара
    var msg = begin_cell()
        .store_uint(0x18, 6)
        .store_msg_addr(jetton_wallet_address)
        .store_coins(0) // Газ
        .store_uint(1, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        .store_uint(0xf8a7ea5, 32) // op::transfer
        .store_uint(0, 64) // query_id
        .store_coins(jetton_amount) // Сколько выводим
        .store_msg_addr(beneficiary_address) // Кому
        .store_msg_addr(beneficiary_address) // Сюда слать излишки газа
        .store_uint(0, 1) // null custom_payload
        .store_coins(0)   // forward_ton_amount
        .store_uint(0, 1); // null forward_payload

    send_raw_message(msg.end_cell(), 64); // Отправляем токены
}
