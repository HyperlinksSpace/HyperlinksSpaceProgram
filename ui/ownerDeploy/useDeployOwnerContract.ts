import { useCallback } from "react";

import type { AppStringKey } from "../../locales/appStrings";
import { useAppStrings } from "../../locales/AppStringsContext";
import { formatTonConnectErrorMessage } from "../ton/formatTonConnectErrorMessage";
import { isTonConnectUserRejection } from "../ton/isTonConnectUserRejection";
import { useTonConnectSession } from "../ton/TonConnectProvider";
import {
  getOwnerDeployBusy,
  getOwnerDraft,
  setOwnerDeployBusy,
  setOwnerDraft,
  useOwnerDeployBusy,
} from "../smart/ownerDraftStore";
import { buildOwnerDeployTransaction, OwnerDeployInputError } from "./buildOwnerDeployTransaction";

const INPUT_ERROR_KEYS: Record<OwnerDeployInputError["code"], AppStringKey> = {
  missing_title: "ownerDeploy.missingTitle",
  missing_wallet: "ownerDeploy.missingWallet",
  invalid_wallet: "ownerDeploy.invalidWallet",
};

export type OwnerDeployResult = {
  ok: boolean;
  /** Null when the wallet modal opened and there is nothing to show yet. */
  message: string | null;
  address?: string;
};

/** Deploy the Tolk Owner contract from the Smart form or the public `/owner-deploy` page. */
export function useDeployOwnerContract() {
  const ton = useTonConnectSession();
  const { t, tf } = useAppStrings();
  const busy = useOwnerDeployBusy();

  const deploy = useCallback(
    async (fields: { title: string; text: string; ownerWallet: string }): Promise<OwnerDeployResult> => {
      if (getOwnerDeployBusy()) return { ok: false, message: null };
      setOwnerDraft({ status: null });
      setOwnerDeployBusy(true);

      try {
        if (!ton.connected || !ton.address) {
          await ton.openConnectModal();
          return { ok: false, message: null };
        }

        const built = buildOwnerDeployTransaction(fields);
        await ton.sendTransaction(built.request);
        const message = tf("ownerDeploy.deploySuccess", { address: built.contractAddress });
        setOwnerDraft({ status: { kind: "ok", message } });
        return { ok: true, message, address: built.contractAddress };
      } catch (error) {
        const message =
          error instanceof OwnerDeployInputError
            ? t(INPUT_ERROR_KEYS[error.code])
            : isTonConnectUserRejection(error)
              ? t("ownerDeploy.deployCancelled")
              : (formatTonConnectErrorMessage(error) ?? t("ownerDeploy.deployError"));
        setOwnerDraft({ status: { kind: "err", message } });
        return { ok: false, message };
      } finally {
        setOwnerDeployBusy(false);
      }
    },
    [t, tf, ton],
  );

  const deployFromDraft = useCallback(async () => {
    const draft = getOwnerDraft();
    return deploy({
      title: draft.title,
      text: draft.text,
      ownerWallet: draft.ownerWallet,
    });
  }, [deploy]);

  return { busy, deploy, deployFromDraft };
}
