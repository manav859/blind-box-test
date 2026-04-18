import { useState, type FormEvent } from "react";
import type {
  RewardGroup,
  UpsertRewardGroupInput,
  BlindBoxStatus,
} from "../../types/blindBox";
import { BLIND_BOX_STATUSES } from "../../types/blindBox";
import {
  FormField,
  SelectInput,
  TextAreaInput,
  TextInput,
} from "../admin/FormField";
import { formatTokenLabel } from "../../utils/format";

export interface RewardGroupFormProps {
  initialValues?: Partial<RewardGroup>;
  isSubmitting: boolean;
  onSubmit: (values: UpsertRewardGroupInput) => Promise<void>;
  onCancel?: () => void;
}

export function RewardGroupForm({
  initialValues,
  isSubmitting,
  onSubmit,
  onCancel,
}: RewardGroupFormProps) {
  const [collectionId, setCollectionId] = useState(
    initialValues?.shoplineCollectionId || ""
  );
  const [status, setStatus] = useState<BlindBoxStatus>(
    initialValues?.status || BLIND_BOX_STATUSES[0]
  );
  const [configJson, setConfigJson] = useState(initialValues?.configJson || "");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!collectionId.trim()) {
      setError("A SHOPLINE collection id is required.");
      return;
    }

    setError(null);
    await onSubmit({
      id: initialValues?.id,
      shoplineCollectionId: collectionId.trim(),
      status,
      configJson: configJson.trim() || null,
    });
  }

  return (
    <form className="stack-lg" onSubmit={handleSubmit}>
      <FormField
        label="SHOPLINE collection ID"
        hint="This collection is the source of truth for reward membership."
        error={error || undefined}
      >
        <TextInput
          className="text-input-code"
          value={collectionId}
          onChange={(event) => setCollectionId(event.target.value)}
          placeholder="gid://shopline/Collection/789"
          autoComplete="off"
          spellCheck={false}
        />
      </FormField>

      <FormField
        label="Status"
        hint="Keep drafts while you are still validating candidate health."
      >
        <SelectInput
          value={status}
          onChange={(event) => setStatus(event.target.value as BlindBoxStatus)}
        >
          {BLIND_BOX_STATUSES.map((option) => (
            <option key={option} value={option}>
              {formatTokenLabel(option)}
            </option>
          ))}
        </SelectInput>
      </FormField>

      <FormField
        label="Config JSON"
        hint="Optional future-facing configuration for group-level rules or exclusions."
      >
        <TextAreaInput
          rows={3}
          value={configJson}
          onChange={(event) => setConfigJson(event.target.value)}
          placeholder='{"notes":"Seasonal reward collection"}'
        />
      </FormField>

      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : initialValues?.id ? "Update Reward Group" : "Save Reward Group"}
        </button>
        {onCancel ? (
          <button
            className="button button-secondary"
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
