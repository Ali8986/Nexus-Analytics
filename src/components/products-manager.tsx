"use client";

import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Package,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ExportCsvButton } from "@/components/export-csv-button";
import {
  archiveProductAction,
  createProductAction,
  loadProducts,
  updateProductAction,
} from "@/app/actions/products";
import type { ProductListItem } from "@/app/actions/products";
import { Button, EmptyState, ErrorState, Surface } from "@/components/ui";
import { formatCurrency } from "@/lib/formatting";
import {
  productInputSchema,
  productUpdateSchema,
} from "@/lib/validation/schemas";

const pageSize = 25;

type ProductFormValues = {
  name: string;
  sku: string;
  unitPrice: string;
  description: string;
};

const emptyValues: ProductFormValues = {
  name: "",
  sku: "",
  unitPrice: "",
  description: "",
};

function productToFormValues(product: ProductListItem): ProductFormValues {
  return {
    name: product.name,
    sku: product.sku,
    unitPrice: String(product.unit_price),
    description: product.description ?? "",
  };
}

function formatCreatedDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function ProductFormDialog({
  product,
  onClose,
  onSaved,
}: {
  product: ProductListItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<ProductFormValues>(
    product ? productToFormValues(product) : emptyValues,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const editing = product !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function close() {
    if (pending) return;
    dialogRef.current?.close();
    onClose();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      name: values.name,
      sku: values.sku,
      unitPrice: values.unitPrice,
      description: values.description || null,
    };
    const parsed = editing
      ? productUpdateSchema.safeParse({ ...input, productId: product.id })
      : productInputSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      );
      setMessage("Please review the highlighted information.");
      return;
    }

    setErrors({});
    setMessage("");
    setPending(true);
    try {
      const result = editing
        ? await updateProductAction(parsed.data)
        : await createProductAction(parsed.data);
      if ("error" in result) {
        setMessage(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      await onSaved();
      dialogRef.current?.close();
      onClose();
    } catch {
      setMessage("The product could not be saved. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      aria-labelledby="product-form-title"
      className="customer-dialog"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      ref={dialogRef}
    >
      <Surface className="customer-dialog-card">
        <div className="customer-dialog-heading">
          <div>
            <p className="auth-eyebrow">{editing ? "PRODUCT DETAILS" : "NEW PRODUCT"}</p>
            <h2 id="product-form-title">{editing ? "Edit product" : "Add a product"}</h2>
            <p className="auth-description">Maintain the catalog for this workspace.</p>
          </div>
          <button
            aria-label="Close dialog"
            className="icon-button"
            disabled={pending}
            onClick={close}
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        <form className="customer-form" noValidate onSubmit={(event) => void submit(event)}>
          <div className="customer-form-grid">
            <label className="customer-form-field">
              <span>Product name *</span>
              <input
                aria-describedby={errors.name ? "product-name-error" : undefined}
                aria-invalid={Boolean(errors.name)}
                autoComplete="off"
                disabled={pending}
                maxLength={200}
                onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
                required
                value={values.name}
              />
              {errors.name ? <small className="customer-field-error" id="product-name-error">{errors.name}</small> : null}
            </label>
            <label className="customer-form-field">
              <span>SKU *</span>
              <input
                aria-describedby={errors.sku ? "product-sku-error" : undefined}
                aria-invalid={Boolean(errors.sku)}
                autoComplete="off"
                disabled={pending}
                maxLength={100}
                onChange={(event) => setValues((current) => ({ ...current, sku: event.target.value }))}
                required
                value={values.sku}
              />
              {errors.sku ? <small className="customer-field-error" id="product-sku-error">{errors.sku}</small> : null}
            </label>
            <label className="customer-form-field">
              <span>Unit price *</span>
              <input
                aria-describedby={errors.unitPrice ? "product-price-error" : undefined}
                aria-invalid={Boolean(errors.unitPrice)}
                autoComplete="off"
                disabled={pending}
                inputMode="decimal"
                maxLength={20}
                onChange={(event) => setValues((current) => ({ ...current, unitPrice: event.target.value }))}
                placeholder="0.0000"
                required
                value={values.unitPrice}
              />
              {errors.unitPrice ? <small className="customer-field-error" id="product-price-error">{errors.unitPrice}</small> : null}
            </label>
            <label className="customer-form-field customer-form-field-wide">
              <span>Description</span>
              <textarea
                aria-describedby={errors.description ? "product-description-error" : undefined}
                aria-invalid={Boolean(errors.description)}
                disabled={pending}
                maxLength={5000}
                onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
                rows={4}
                value={values.description}
              />
              {errors.description ? <small className="customer-field-error" id="product-description-error">{errors.description}</small> : null}
            </label>
          </div>
          {message ? <p className="customer-form-message" role="alert">{message}</p> : null}
          <div className="customer-dialog-actions">
            <Button disabled={pending} onClick={close} type="button">Cancel</Button>
            <Button disabled={pending} type="submit" variant="primary">
              {pending ? "Saving…" : editing ? "Save changes" : "Create product"}
            </Button>
          </div>
        </form>
      </Surface>
    </dialog>
  );
}

function ArchiveProductDialog({
  product,
  pending,
  onCancel,
  onConfirm,
}: {
  product: ProductListItem;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      aria-labelledby="archive-product-title"
      className="customer-dialog customer-confirm-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
      ref={dialogRef}
    >
      <Surface className="customer-dialog-card">
        <p className="auth-eyebrow">ARCHIVE PRODUCT</p>
        <h2 id="archive-product-title">Archive {product.name}?</h2>
        <p className="auth-description">
          This product will be hidden from the active catalog. Existing order records remain unchanged, and the product can still be viewed using the archived filter.
        </p>
        <div className="customer-dialog-actions">
          <Button disabled={pending} onClick={onCancel} type="button">Cancel</Button>
          <Button disabled={pending} onClick={onConfirm} type="button" variant="primary">
            {pending ? "Archiving…" : "Archive product"}
          </Button>
        </div>
      </Surface>
    </dialog>
  );
}

export function ProductsManager({
  canExport,
  canManage,
  currency,
  initialError,
  initialHasMore,
  initialProducts,
  workspaceName,
}: {
  canExport: boolean;
  canManage: boolean;
  currency: string;
  initialError: string;
  initialHasMore: boolean;
  initialProducts: ProductListItem[];
  workspaceName: string;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [error, setError] = useState(initialError);
  const [successMessage, setSuccessMessage] = useState("");
  const [query, setQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [editingProduct, setEditingProduct] = useState<ProductListItem | null | undefined>();
  const [archivingProduct, setArchivingProduct] = useState<ProductListItem | null>(null);
  const [pending, setPending] = useState(false);
  const [archivePending, setArchivePending] = useState(false);

  async function refreshList(options?: {
    search?: string;
    archived?: boolean;
    nextOffset?: number;
  }) {
    const search = options?.search ?? appliedSearch;
    const archived = options?.archived ?? includeArchived;
    const nextOffset = options?.nextOffset ?? offset;
    setError("");
    setPending(true);
    try {
      const result = await loadProducts({
        limit: pageSize,
        offset: nextOffset,
        search: search || undefined,
        includeArchived: archived,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setProducts(result.products);
      setHasMore(result.hasMore);
      setSuccessMessage("");
    } catch {
      setError("Products could not be loaded. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = query.trim();
    setAppliedSearch(search);
    setOffset(0);
    void refreshList({ search, nextOffset: 0 });
  }

  function toggleArchived() {
    const archived = !includeArchived;
    setIncludeArchived(archived);
    setOffset(0);
    void refreshList({ archived, nextOffset: 0 });
  }

  async function confirmArchive() {
    if (!archivingProduct) return;
    setArchivePending(true);
    try {
      const result = await archiveProductAction({ productId: archivingProduct.id });
      if ("error" in result) {
        setError(result.error);
        setArchivingProduct(null);
        return;
      }
      const name = archivingProduct.name;
      setArchivingProduct(null);
      await refreshList();
      setSuccessMessage(`${name} was archived.`);
    } catch {
      setError("The product could not be archived. Please try again.");
    } finally {
      setArchivePending(false);
    }
  }

  return (
    <div className="customers-page">
      <div className="customers-page-heading">
        <div>
          <p className="eyebrow">WORKSPACE CATALOG</p>
          <h1>Products</h1>
          <p>Manage products and pricing in {workspaceName}.</p>
        </div>
        <div className="customers-heading-actions">
          {canExport ? <ExportCsvButton endpoint="/api/exports/products" /> : null}
          {canManage ? (
            <Button onClick={() => setEditingProduct(null)} variant="primary">
              <Plus size={16} /> Add product
            </Button>
          ) : null}
        </div>
      </div>

      <Surface className="customers-surface">
        <div className="customers-toolbar">
          <form className="customers-search" onSubmit={submitSearch} role="search">
            <Search aria-hidden="true" size={16} />
            <input
              aria-label="Search products"
              maxLength={100}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product name, SKU, or description"
              value={query}
            />
            <Button disabled={pending} size="small" type="submit">Search</Button>
          </form>
          <label className="customers-archived-toggle">
            <input
              checked={includeArchived}
              disabled={pending}
              onChange={toggleArchived}
              type="checkbox"
            />
            Include archived
          </label>
        </div>

        {successMessage ? (
          <p className="customers-success-message" role="status">{successMessage}</p>
        ) : null}
        {error ? (
          <ErrorState
            description={error}
            onRetry={() => void refreshList()}
            title="Products couldn’t be loaded"
          />
        ) : pending ? (
          <div aria-busy="true" className="customers-loading" role="status">
            Loading products…
          </div>
        ) : products.length ? (
          <>
            <div className="table-scroll">
              <table className="data-table customers-table products-table">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">SKU</th>
                    <th scope="col">Description</th>
                    <th scope="col">Unit price</th>
                    <th scope="col">Added</th>
                    <th scope="col">Status</th>
                    {canManage ? <th scope="col"><span className="sr-only">Actions</span></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="customer-cell">
                          <span className="product-catalog-icon"><Package size={15} /></span>
                          <span><strong>{product.name}</strong></span>
                        </div>
                      </td>
                      <td className="product-sku-cell">{product.sku}</td>
                      <td className="product-description-cell">
                        {product.description || <span className="customers-muted">No description</span>}
                      </td>
                      <td className="table-amount">
                        {formatCurrency(Number(product.unit_price), currency, 2)}
                      </td>
                      <td className="table-date">{formatCreatedDate(product.created_at)}</td>
                      <td>
                        <span className={`customer-status${product.archived_at ? " customer-status-archived" : ""}`}>
                          <span aria-hidden="true" />
                          {product.archived_at ? "Archived" : "Active"}
                        </span>
                      </td>
                      {canManage ? (
                        <td>
                          <div className="customer-row-actions">
                            <button
                              aria-label={`Edit ${product.name}`}
                              className="icon-button"
                              disabled={pending}
                              onClick={() => setEditingProduct(product)}
                              type="button"
                            >
                              <Pencil size={14} />
                            </button>
                            {!product.archived_at ? (
                              <button
                                aria-label={`Archive ${product.name}`}
                                className="icon-button customer-archive-button"
                                disabled={pending}
                                onClick={() => setArchivingProduct(product)}
                                type="button"
                              >
                                <Archive size={14} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="customers-pagination">
              <span>
                Showing {offset + 1}–{offset + products.length}
                {appliedSearch ? ` for “${appliedSearch}”` : ""}
              </span>
              <div>
                <Button
                  disabled={pending || offset === 0}
                  onClick={() => {
                    const nextOffset = Math.max(0, offset - pageSize);
                    setOffset(nextOffset);
                    void refreshList({ nextOffset });
                  }}
                  size="small"
                >
                  <ChevronLeft size={14} /> Previous
                </Button>
                <Button
                  disabled={pending || !hasMore}
                  onClick={() => {
                    const nextOffset = offset + pageSize;
                    setOffset(nextOffset);
                    void refreshList({ nextOffset });
                  }}
                  size="small"
                >
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <EmptyState
              action={canManage && offset === 0 ? (
                <Button onClick={() => setEditingProduct(null)} variant="primary">
                  <Plus size={15} /> Add product
                </Button>
              ) : undefined}
              description={
                appliedSearch
                  ? "Try a different search, or clear the search field."
                  : includeArchived
                    ? "There are no products matching this view."
                    : "Products you add to this workspace will appear here."
              }
              title={appliedSearch ? "No matching products" : "No products yet"}
            />
            {offset > 0 ? (
              <div className="customers-pagination">
                <span>No products on this page.</span>
                <Button
                  disabled={pending}
                  onClick={() => {
                    const nextOffset = Math.max(0, offset - pageSize);
                    setOffset(nextOffset);
                    void refreshList({ nextOffset });
                  }}
                  size="small"
                >
                  <ChevronLeft size={14} /> Previous
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Surface>

      {editingProduct !== undefined ? (
        <ProductFormDialog
          onClose={() => setEditingProduct(undefined)}
          onSaved={async () => {
            await refreshList();
            setSuccessMessage(editingProduct ? "Product changes saved." : "Product created.");
          }}
          product={editingProduct}
        />
      ) : null}
      {archivingProduct ? (
        <ArchiveProductDialog
          onCancel={() => setArchivingProduct(null)}
          onConfirm={() => void confirmArchive()}
          pending={archivePending}
          product={archivingProduct}
        />
      ) : null}
    </div>
  );
}
