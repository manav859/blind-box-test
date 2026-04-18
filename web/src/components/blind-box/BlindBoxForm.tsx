import { useState, type FormEvent } from "react";
import {
  BLIND_BOX_SELECTION_STRATEGIES,
  BLIND_BOX_STATUSES,
  type BlindBox,
  type BlindBoxSelectionStrategy,
  type BlindBoxStatus,
  type CreateBlindBoxInput,
} from "../../types/blindBox";
import {
  FormField,
  SelectInput,
  TextAreaInput,
  TextInput,
} from "../admin/FormField";
import { formatTokenLabel } from "../../utils/format";

export interface BlindBoxFormProps {
  initialValues?: Partial<CreateBlindBoxInput>;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (values: CreateBlindBoxInput) => Promise<void>;
  includeStatus?: boolean;
}

interface BlindBoxFormErrors {
  name?: string;
}

export function BlindBoxForm({
  initialValues,
  submitLabel,
  isSubmitting,
  onSubmit,
  includeStatus = true,
}: BlindBoxFormProps) {
  const [name, setName] = useState(initialValues?.name || "");
  const [description, setDescription] = useState(initialValues?.description || "");
  const [selectionStrategy, setSelectionStrategy] =
    useState<BlindBoxSelectionStrategy>(
      initialValues?.selectionStrategy || BLIND_BOX_SELECTION_STRATEGIES[0]
    );
  const [status, setStatus] = useState<BlindBoxStatus>(
    initialValues?.status || BLIND_BOX_STATUSES[0]
  );
  const [errors, setErrors] = useState<BlindBoxFormErrors>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      setErrors({ name: "Name is required." });
      return;
    }

    setErrors({});

    await onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      selectionStrategy,
      status,
      shoplineProductId: initialValues?.shoplineProductId || null,
      shoplineVariantId: initialValues?.shoplineVariantId || null,
      productTitleSnapshot: initialValues?.productTitleSnapshot || name.trim(),
    });
  }

  return (
    <form className="stack-lg" onSubmit={handleSubmit}>
      <div className="form-grid">
        <FormField
          label="Blind box label"
          hint="Internal label for this detected blind-box product."
          error={errors.name}
        >
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Spring launch blind box"
          />
        </FormField>

        <FormField
          label="SHOPLINE product ID"
          hint="Read-only. Blind-box identity is derived from the tagged SHOPLINE product."
        >
          <div className="text-input text-input-code is-readonly">
            {initialValues?.shoplineProductId || "Legacy configuration"}
          </div>
        </FormField>

        <FormField
          label="SHOPLINE variant ID"
          hint="Read-only. Variant-specific legacy references remain visible, but new detection is product-level."
        >
          <div className="text-input text-input-code is-readonly">
            {initialValues?.shoplineVariantId || "Product-level detection"}
          </div>
        </FormField>

        <FormField
          label="Selection strategy"
          hint="Reward selection still happens server-side after payment."
        >
          <SelectInput
            value={selectionStrategy}
            onChange={(event) =>
              setSelectionStrategy(
                event.target.value as BlindBoxSelectionStrategy
              )
            }
          >
            {BLIND_BOX_SELECTION_STRATEGIES.map((strategy) => (
              <option key={strategy} value={strategy}>
                {formatTokenLabel(strategy)}
              </option>
            ))}
          </SelectInput>
        </FormField>

        {includeStatus ? (
          <FormField
            label="Status"
            hint="Draft boxes can be configured safely before activation."
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
        ) : null}
      </div>

      <FormField
        label="Description"
        hint="Optional internal notes for this blind box."
      >
        <TextAreaInput
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Used for the summer campaign with weighted top prizes."
        />
      </FormField>

      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function getBlindBoxFormValues(blindBox: BlindBox): CreateBlindBoxInput {
  return {
    name: blindBox.name,
    description: blindBox.description,
    selectionStrategy: blindBox.selectionStrategy,
    status: blindBox.status,
    shoplineProductId: blindBox.shoplineProductId,
    shoplineVariantId: blindBox.shoplineVariantId,
    productTitleSnapshot: blindBox.productTitleSnapshot,
    configJson: blindBox.configJson,
  };
}
