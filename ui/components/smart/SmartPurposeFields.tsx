import { useState } from "react";

import type { AppStringKey } from "../../../locales/appStrings";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { SmartTitleTextSection } from "./SmartTitleTextSection";

type Props = {
  purposeKey: string; // e.g. "agreement", "investment"
};

function readTranslatedValue(t: (key: AppStringKey) => string, key: AppStringKey) {
  const value = t(key);
  return value === key ? "" : value;
}

export function SmartPurposeFields({ purposeKey }: Props) {
  const { t } = useAppStrings();
  const base = `smart.${purposeKey}` as const;

  const [title, setTitle] = useState(() => {
    const explicit = readTranslatedValue(t, `${base}.titleDefault` as AppStringKey);
    return explicit || t(`smart.dealVersion.${purposeKey}` as AppStringKey);
  });
  const [bodyText, setBodyText] = useState("");

  const titleLabel = readTranslatedValue(t, `${base}.titleLabel` as AppStringKey) || t("smart.company.titleLabel");
  const textLabel = readTranslatedValue(t, `${base}.textLabel` as AppStringKey) || t("smart.company.textLabel");
  const textPlaceholder =
    readTranslatedValue(t, `${base}.textPlaceholder` as AppStringKey) || t("smart.company.textPlaceholder");

  return (
    <SmartTitleTextSection
      title={title}
      text={bodyText}
      titleLabel={titleLabel}
      textLabel={textLabel}
      textPlaceholder={textPlaceholder}
      titleInputId={`smart-${purposeKey}-title-input`}
      textInputId={`smart-${purposeKey}-text-input`}
      onChangeTitle={setTitle}
      onChangeText={setBodyText}
    />
  );
}
