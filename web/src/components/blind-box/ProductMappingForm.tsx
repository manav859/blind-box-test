import { useState, type FormEvent } from "react";
import type {
  BlindBoxProductMapping,
  UpsertBlindBoxProductMappingInput,
} from "../../types/blindBox";
import {
  CheckboxField,
  FormField,
  TextInput,
} from "../admin/FormField";

export interface ProductMappingFormProps {
  blindBoxId: string;
  initialValues?: Partial<BlindBoxProductMapping>;
  isSubmitting: boolean;
  onSubmit: (values: UpsertBlindBoxProductMappingInput) => Promise<void>;
  onCancel?: () => void;
}

export function ProductMappingForm({
  blindBoxId,
  initialValues,
  isSubmitting,
  onSubmit,
  onCancel,
}: ProductMappingFormProps) {
  const [productId, setProductId] = useState(initialValues?.productId || "");
  const [productVariantId, setProductVariantId] = useState(
    initialValues?.productVariantId || ""
  );
  const [enabled, setEnabled] = useState(initialValues?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!productId.trim()) {
      setError("Product ID is required.");
      return;
    }

    setError(null);
    await onSubmit({
      id: initialValues?.id,
      blindBoxId,
      productId: productId.trim(),
      productVariantId: productVariantId.trim() || null,
      enabled,
    });
  }

  return (
    <form className="stack-lg" onSubmit={handleSubmit}>
      <div className="info-list-item">
        <strong>Storefront purchase mapping</strong>
        <span>
          This mapping identifies the real SHOPLINE product or variant customers buy
          through native cart and checkout.
        </span>
        <span>
          It is separate from pool-item <code className="inline-code">sourceVariantId</code>,
          which points to the prize inventory variant decremented after assignment.
        </span>
      </div>

      <div className="form-grid">
        <FormField
          label="Storefront blind-box product ID"
          hint="Required. This is the sellable SHOPLINE product customers purchase as the blind box."
          error={error || undefined}
        >
          <TextInput
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            placeholder="gid://shopline/Product/123"
          />
        </FormField>

        <FormField
          label="Storefront blind-box variant ID"
          hint="Strongly recommended. Required automatically when the sold product has multiple variants."
        >
          <TextInput
            value={productVariantId}
            onChange={(event) => setProductVariantId(event.target.value)}
            placeholder="gid://shopline/ProductVariant/456"
          />
        </FormField>
      </div>

      <CheckboxField
        label="Mapping enabled"
        hint="Disabled mappings will not mark paid order lines as blind-box purchases."
        checked={enabled}
        onChange={(event) => setEnabled(event.target.checked)}
      />

      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving..."
            : initialValues?.id
            ? "Update Mapping"
            : "Add Mapping"}
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
