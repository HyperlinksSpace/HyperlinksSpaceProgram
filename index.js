// Earliest bundle entry: polyfill Node `Buffer` before expo-router loads route modules (@ton/* uses it at load time).
import "./polyfills/buffer";
import "expo-router/entry";
