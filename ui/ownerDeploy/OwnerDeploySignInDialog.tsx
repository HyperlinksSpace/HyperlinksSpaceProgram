import { useEffect } from "react";

import { useAppStrings } from "../../locales/AppStringsContext";
import { AppModalSheet } from "../components/AppModalSheet";
import { WelcomeAuthButtons } from "../components/WelcomeAuthButtons";
import { markOwnerDeployAfterAuth } from "./ownerDeployAfterAuth";

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Welcome-style provider list in a floating dialog (email + OAuth). */
export function OwnerDeploySignInDialog({ visible, onClose }: Props) {
  const { t } = useAppStrings();

  useEffect(() => {
    if (!visible) return;
    markOwnerDeployAfterAuth();
  }, [visible]);

  if (!visible) return null;

  return (
    <AppModalSheet
      visible
      onClose={onClose}
      title={t("ownerDeploy.signInTitle")}
      fitContentHeight
      minSize={{ width: 320, height: 280 }}
      sizeStorageKey="hsp.ownerDeploySignIn.size.v1"
      offsetStorageKey="hsp.ownerDeploySignIn.offset.v1"
    >
      <WelcomeAuthButtons hideAppPreviews />
    </AppModalSheet>
  );
}
