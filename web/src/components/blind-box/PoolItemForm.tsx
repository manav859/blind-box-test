import { useState, type FormEvent } from "react";
import type {
  BlindBoxPoolItem,
  UpsertBlindBoxPoolItemInput,
} from "../../types/blindBox";
import {
  CheckboxField,
  FormField,
  TextAreaInput,
  TextInput,
} from "../admin/FormField";

export interface PoolItemFormProps {
  blindBoxId: string;
  initialValues?: Partial<BlindBoxPoolItem>;
  isSubmitting: boolean;
  onSubmit: (values: UpsertBlindBoxPoolItemInput) => Promise<void>;
  onCancel?: () => void;
}

interface PoolItemFormErrors {
  label?: string;
  weight?: string;
  inventoryQuantity?: string;
}

export function PoolItemForm({
  blindBoxId,
  initialValues,
  isSubmitting,
  onSubmit,
  onCancel,
}: PoolItemFormProps) {
  const [label, setLabel] = useState(initialValues?.label || "");
  const [sourceProductId, setSourceProductId] = useState(
    initialValues?.sourceProductId || ""
  );
  const [sourceVariantId, setSourceVariantId] = useState(
    initialValues?.sourceVariantId || ""
  );
  const [weight, setWeight] = useState(String(initialValues?.weight ?? 1));
  const [inventoryQuantity, setInventoryQuantity] = useState(
    String(initialValues?.inventoryQuantity ?? 0)
  );
  const [metadata, setMetadata] = useState(initialValues?.metadata || "");
  const [enabled, setEnabled] = useState(initialValues?.enabled ?? true);
  const [errors, setErrors] = useState<PoolItemFormErrors>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: PoolItemFormErrors = {};
    const parsedWeight = Number(weight);
    const parsedInventoryQuantity = Number(inventoryQuantity);

    if (!label.trim()) {
      nextErrors.label = "Item label is required.";
    }

    if (!Number.isInteger(parsedWeight) || parsedWeight <= 0) {
      nextErrors.weight = "Weight must be a positive integer.";
    }

    if (!Number.isInteger(parsedInventoryQuantity) || parsedInventoryQuantity < 0) {
      nextErrors.inventoryQuantity =
        "Inventory quantity must be a non-negative integer.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});

    await onSubmit({
      id: initialValues?.id,
      blindBoxId,
      label: label.trim(),
      sourceProductId: sourceProductId.trim() || null,
      sourceVariantId: sourceVariantId.trim() || null,
      enabled,
      weight: parsedWeight,
      inventoryQuantity: parsedInventoryQuantity,
      metadata: metadata.trim() || null,
    });
  }

  return (
    <form className="pool-item-form-layout stack-xl" onSubmit={handleSubmit}>
      <section className="pool-item-form-section stack-md">
        <div className="pool-item-form-section-header">
          <strong>Pool item details</strong>
          <span>Basic item settings used by the assignment workflow.</span>
        </div>

        <div className="pool-item-form-grid pool-item-form-grid--basics">
          <FormField label="Item label" error={errors.label}>
            <TextInput
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Golden rabbit plush"
            />
          </FormField>

          <FormField
            label="Weight"
            hint="Used only when the blind box strategy is weighted."
            error={errors.weight}
          >
            <TextInput
              type="number"
              min={1}
              step={1}
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />
          </FormField>

          <FormField
            label="Inventory quantity"
            hint="App-managed quantity used for eligibility checks."
            error={errors.inventoryQuantity}
          >
            <TextInput
              type="number"
              min={0}
              step={1}
              value={inventoryQuantity}
              onChange={(event) => setInventoryQuantity(event.target.value)}
            />
          </FormField>
        </div>
      </section>

      <section className="pool-item-form-section stack-md">
        <div className="pool-item-form-section-header">
          <strong>SHOPLINE execute-mode identifiers</strong>
          <span>
            Paste the real product and variant ids from the connected store. The
            variant id is the primary execute-mode target.
          </span>
        </div>

        <div className="pool-item-form-grid pool-item-form-grid--source">
          <FormField
            label="Source product ID"
            hint="Used for product-level traceability and fallback resolution when only one variant exists."
          >
            <TextInput
              className="text-input-code"
              value={sourceProductId}
              onChange={(event) => setSourceProductId(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="gid://shopline/Product/123"
            />
          </FormField>

          <FormField
            label="Source variant ID"
            hint="Use the exact SHOPLINE variant execute mode should decrement. Required when the product has multiple variants."
          >
            <TextInput
              className="text-input-code"
              value={sourceVariantId}
              onChange={(event) => setSourceVariantId(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="gid://shopline/ProductVariant/456"
            />
          </FormField>
        </div>
      </section>

      <section className="pool-item-form-section stack-md">
        <div className="pool-item-form-section-header">
          <strong>Operational notes</strong>
          <span>Optional metadata and enablement controls for operator workflows.</span>
        </div>

        <FormField
          label="Metadata"
          hint="Optional internal JSON or notes for fulfillment workflows."
        >
          <TextAreaInput
            rows={3}
            value={metadata}
            onChange={(event) => setMetadata(event.target.value)}
            placeholder='{"tier":"rare"}'
          />
        </FormField>

        <CheckboxField
          label="Item enabled"
          hint="Disabled items stay in the pool but cannot be assigned."
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
      </section>

      <div className="form-actions pool-item-form-actions">
        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : initialValues?.id ? "Update Item" : "Add Item"}
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
