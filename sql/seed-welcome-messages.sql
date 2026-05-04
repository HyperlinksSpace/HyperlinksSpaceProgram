-- Seed feed_default_messages to mirror the demo feed screenshot (welcome_messages icons).
-- Icons are served from public/welcome_messages/ → URLs /welcome_messages/<file>.svg
-- Re-run safe: deletes these keys first then inserts.

DELETE FROM feed_default_messages
WHERE key IN (
  'demo_wallet_created',
  'demo_creator_likely',
  'demo_nft_received',
  'demo_token_granted',
  'demo_incoming_task'
);

INSERT INTO feed_default_messages (key, locale, kind, message_variant, body, version)
VALUES
  (
    'demo_wallet_created',
    'en',
    'feed_default',
    'system_action',
    $json$
{
  "card_type": "system_action",
  "layout_variant": "action_hint",
  "payload": {
    "title": "Wallet created",
    "subtitle": "Press to save 24 words",
    "icon": { "type": "svg_url", "url": "/welcome_messages/welcome.svg" }
  }
}
$json$::jsonb,
    1
  ),
  (
    'demo_creator_likely',
    'en',
    'feed_default',
    'user_status',
    $json$
{
  "card_type": "user_status",
  "layout_variant": "compact",
  "payload": {
    "title": "You are likely a creator",
    "subtitle": "Press to access creators p...",
    "icon": { "type": "svg_url", "url": "/welcome_messages/creator.svg" }
  }
}
$json$::jsonb,
    1
  ),
  (
    'demo_nft_received',
    'en',
    'feed_default',
    'transaction_asset',
    $json$
{
  "card_type": "transaction_asset",
  "layout_variant": "value_trailing",
  "payload": {
    "title": "NFT recieved",
    "subtitle": "$24",
    "trailing_label": "NFT recieved",
    "icon": { "type": "svg_url", "url": "/welcome_messages/NFT.svg" }
  }
}
$json$::jsonb,
    1
  ),
  (
    'demo_token_granted',
    'en',
    'feed_default',
    'reward_token',
    $json$
{
  "card_type": "reward_token",
  "layout_variant": "value_trailing",
  "payload": {
    "title": "Token granted",
    "subtitle": "$1",
    "trailing_label": "+1 DLLR",
    "icon": { "type": "svg_url", "url": "/welcome_messages/token.svg" }
  }
}
$json$::jsonb,
    1
  ),
  (
    'demo_incoming_task',
    'en',
    'feed_default',
    'task_gig',
    $json$
{
  "card_type": "task_gig",
  "layout_variant": "compact",
  "payload": {
    "title": "Incoming task",
    "subtitle": "$24",
    "icon": { "type": "svg_url", "url": "/welcome_messages/task.svg" }
  }
}
$json$::jsonb,
    1
  );
