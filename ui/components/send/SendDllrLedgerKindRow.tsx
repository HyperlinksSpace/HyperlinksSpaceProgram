import { Pressable, Text, View } from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import type { DllrLedgerKind } from "../../../shared/dllrLedgerKind";
import { typographyAeroport15, useColors } from "../../theme";

type Props = {
  kind: DllrLedgerKind;
  onChange: (kind: DllrLedgerKind) => void;
  hotUsd: number;
  frozenUsd: number;
};

function Chip({
  label,
  balanceLabel,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  balanceLabel: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        minWidth: 0,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: selected ? colors.undercover : "transparent",
        opacity: disabled ? 0.35 : 1,
        borderWidth: 1,
        borderColor: selected ? colors.undercover : colors.secondary,
      }}
    >
      <Text
        style={[
          typographyAeroport15,
          { color: disabled ? colors.secondary : colors.primary, fontWeight: "500" },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[typographyAeroport15, { color: colors.secondary, marginTop: 2 }]}
        numberOfLines={1}
      >
        {balanceLabel}
      </Text>
    </Pressable>
  );
}

/** Hot / Frozen DLLR source picker — empty legs are disabled. */
export function SendDllrLedgerKindRow({ kind, onChange, hotUsd, frozenUsd }: Props) {
  const { t, locale } = useAppStrings();
  const hotEnabled = hotUsd > 1e-9;
  const frozenEnabled = frozenUsd > 1e-9;

  const formatUsd = (n: number) =>
    n.toLocaleString(locale === "ru" ? "ru-RU" : locale === "zh" ? "zh-CN" : "en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });

  return (
    <View style={{ flexDirection: "row", alignItems: "stretch", gap: 10, width: "100%" }}>
      <Chip
        label={t("send.dllrLedger.hot")}
        balanceLabel={formatUsd(hotUsd)}
        selected={kind === "hot"}
        disabled={!hotEnabled}
        onPress={() => onChange("hot")}
      />
      <Chip
        label={t("send.dllrLedger.frozen")}
        balanceLabel={formatUsd(frozenUsd)}
        selected={kind === "frozen"}
        disabled={!frozenEnabled}
        onPress={() => onChange("frozen")}
      />
    </View>
  );
}
