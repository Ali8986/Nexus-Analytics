"use client";

import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { ExportCsvButton } from "@/components/export-csv-button";
import {
  archiveCustomerAction,
  createCustomerAction,
  loadCustomers,
  updateCustomerAction,
} from "@/app/actions/customers";
import type { CustomerListItem } from "@/app/actions/customers";
import { Button, EmptyState, ErrorState, Surface } from "@/components/ui";
import {
  customerInputSchema,
  customerUpdateSchema,
} from "@/lib/validation/schemas";

const pageSize = 25;

const customerFields = [
  { name: "name", label: "Full name", required: true, autoComplete: "name" },
  { name: "companyName", label: "Company", autoComplete: "organization" },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  { name: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
  { name: "addressLine1", label: "Address line 1", autoComplete: "address-line1" },
  { name: "addressLine2", label: "Address line 2", autoComplete: "address-line2" },
  { name: "city", label: "City", autoComplete: "address-level2" },
  { name: "region", label: "State / region", autoComplete: "address-level1" },
  { name: "postalCode", label: "Postal code", autoComplete: "postal-code" },
  { name: "countryCode", label: "Country code", autoComplete: "country" },
] as const;

type CustomerFormValues = Record<(typeof customerFields)[number]["name"], string>;

const emptyValues: CustomerFormValues = {
  name: "",
  companyName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  countryCode: "",
};

function customerToFormValues(customer: CustomerListItem): CustomerFormValues {
  return {
    name: customer.name,
    companyName: customer.company_name ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    addressLine1: customer.address_line_1 ?? "",
    addressLine2: customer.address_line_2 ?? "",
    city: customer.city ?? "",
    region: customer.region ?? "",
    postalCode: customer.postal_code ?? "",
    countryCode: customer.country_code ?? "",
  };
}

function getCustomerInput(values: CustomerFormValues) {
  return {
    name: values.name,
    companyName: values.companyName || null,
    email: values.email || null,
    phone: values.phone || null,
    addressLine1: values.addressLine1 || null,
    addressLine2: values.addressLine2 || null,
    city: values.city || null,
    region: values.region || null,
    postalCode: values.postalCode || null,
    countryCode: values.countryCode || null,
  };
}

function formatCreatedDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function customerLocation(customer: CustomerListItem): string {
  return [customer.city, customer.region, customer.country_code]
    .filter(Boolean)
    .join(", ");
}

function CustomerFormDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerListItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<CustomerFormValues>(
    customer ? customerToFormValues(customer) : emptyValues,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const editing = customer !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
  }, []);

  function close() {
    dialogRef.current?.close();
    onClose();
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = getCustomerInput(values);
    const parsed = editing
      ? customerUpdateSchema.safeParse({ ...input, customerId: customer.id })
      : customerInputSchema.safeParse(input);
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
    startTransition(async () => {
      try {
        const result = editing
          ? await updateCustomerAction(parsed.data)
          : await createCustomerAction(parsed.data);
        if ("error" in result) {
          setMessage(result.error);
          setErrors(result.fieldErrors ?? {});
          return;
        }
        await onSaved();
        close();
      } catch {
        setMessage("The customer could not be saved. Please try again.");
      }
    });
  }

  function fieldMaxLength(name: string): number | undefined {
    switch (name) {
      case "name":
      case "companyName":
      case "addressLine1":
      case "addressLine2":
        return 200;
      case "email":
        return 320;
      case "phone":
        return 50;
      case "city":
      case "region":
        return 100;
      case "postalCode":
        return 30;
      case "countryCode":
        return 2;
      default:
        return undefined;
    }
  }

  return (
    <dialog
      aria-labelledby="customer-form-title"
      className="customer-dialog"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) close();
      }}
      ref={dialogRef}
    >
      <Surface className="customer-dialog-card">
        <div className="customer-dialog-heading">
          <div>
            <p className="auth-eyebrow">{editing ? "CUSTOMER DETAILS" : "NEW CUSTOMER"}</p>
            <h2 id="customer-form-title">{editing ? "Edit customer" : "Add a customer"}</h2>
            <p className="auth-description">Save contact details to this workspace.</p>
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
        <form className="customer-form" noValidate onSubmit={submit}>
          <div className="customer-form-grid">
            {customerFields.map((field) => (
              <label className="customer-form-field" key={field.name}>
                <span>
                  {field.label}
                  {"required" in field && field.required ? " *" : ""}
                </span>
                <input
                  autoComplete={field.autoComplete}
                  aria-invalid={Boolean(errors[field.name])}
                  aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
                  disabled={pending}
                  maxLength={fieldMaxLength(field.name)}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                  required={"required" in field && field.required}
                  type={"type" in field ? field.type : "text"}
                  value={values[field.name]}
                />
                {errors[field.name] ? (
                  <small className="customer-field-error" id={`${field.name}-error`}>
                    {errors[field.name]}
                  </small>
                ) : null}
              </label>
            ))}
          </div>
          {message ? (
            <p className="customer-form-message" role="alert">{message}</p>
          ) : null}
          <div className="customer-dialog-actions">
            <Button disabled={pending} onClick={close} type="button">Cancel</Button>
            <Button disabled={pending} type="submit" variant="primary">
              {pending ? "Saving…" : editing ? "Save changes" : "Create customer"}
            </Button>
          </div>
        </form>
      </Surface>
    </dialog>
  );
}

function ArchiveDialog({
  customer,
  pending,
  onCancel,
  onConfirm,
}: {
  customer: CustomerListItem;
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
      aria-labelledby="archive-customer-title"
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
        <p className="auth-eyebrow">ARCHIVE CUSTOMER</p>
        <h2 id="archive-customer-title">Archive {customer.name}?</h2>
        <p className="auth-description">
          This customer will be hidden from the active list. Their record is kept and can be viewed using the archived filter.
        </p>
        <div className="customer-dialog-actions">
          <Button disabled={pending} onClick={onCancel} type="button">Cancel</Button>
          <Button disabled={pending} onClick={onConfirm} type="button" variant="primary">
            {pending ? "Archiving…" : "Archive customer"}
          </Button>
        </div>
      </Surface>
    </dialog>
  );
}

export function CustomersManager({
  canExport,
  canManage,
  initialCustomers,
  initialError,
  initialHasMore,
  workspaceName,
}: {
  canExport: boolean;
  canManage: boolean;
  initialCustomers: CustomerListItem[];
  initialError: string;
  initialHasMore: boolean;
  workspaceName: string;
}) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [error, setError] = useState(initialError);
  const [successMessage, setSuccessMessage] = useState("");
  const [query, setQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [editingCustomer, setEditingCustomer] = useState<CustomerListItem | null | undefined>();
  const [archivingCustomer, setArchivingCustomer] = useState<CustomerListItem | null>(null);
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
      const result = await loadCustomers({
        limit: pageSize,
        offset: nextOffset,
        search: search || undefined,
        includeArchived: archived,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCustomers(result.customers);
      setHasMore(result.hasMore);
      setSuccessMessage("");
    } catch {
      setError("Customers could not be loaded. Please try again.");
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
    if (!archivingCustomer) return;
    setArchivePending(true);
    try {
      const result = await archiveCustomerAction({ customerId: archivingCustomer.id });
      if ("error" in result) {
        setError(result.error);
        setArchivingCustomer(null);
        return;
      }
      const name = archivingCustomer.name;
      setArchivingCustomer(null);
      await refreshList();
      setSuccessMessage(`${name} was archived.`);
    } catch {
      setError("The customer could not be archived. Please try again.");
    } finally {
      setArchivePending(false);
    }
  }

  return (
    <div className="customers-page">
      <div className="customers-page-heading">
        <div>
          <p className="eyebrow">WORKSPACE DIRECTORY</p>
          <h1>Customers</h1>
          <p>Manage customer contacts in {workspaceName}.</p>
        </div>
        <div className="customers-heading-actions">
          {canExport ? <ExportCsvButton endpoint="/api/exports/customers" /> : null}
          {canManage ? (
            <Button
              onClick={() => setEditingCustomer(null)}
              variant="primary"
            >
              <Plus size={16} /> Add customer
            </Button>
          ) : null}
        </div>
      </div>

      <Surface className="customers-surface">
        <div className="customers-toolbar">
          <form className="customers-search" onSubmit={submitSearch} role="search">
            <Search aria-hidden="true" size={16} />
            <input
              aria-label="Search customers"
              maxLength={100}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, company, email, or phone"
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
            title="Customers couldn’t be loaded"
          />
        ) : pending ? (
          <div aria-busy="true" className="customers-loading" role="status">
            Loading customers…
          </div>
        ) : customers.length ? (
          <>
            <div className="table-scroll">
              <table className="data-table customers-table">
                <thead>
                  <tr>
                    <th scope="col">Customer</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Location</th>
                    <th scope="col">Added</th>
                    <th scope="col">Status</th>
                    {canManage ? <th scope="col"><span className="sr-only">Actions</span></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => {
                    const location = customerLocation(customer);
                    return (
                      <tr key={customer.id}>
                        <td>
                          <div className="customer-cell">
                            <span className="customer-avatar">
                              {customer.name.trim().slice(0, 1).toUpperCase()}
                            </span>
                            <span>
                              <strong>{customer.name}</strong>
                              <small>{customer.company_name || "Individual customer"}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="customers-contact-cell">
                            {customer.email ? <span><Mail size={12} />{customer.email}</span> : null}
                            {customer.phone ? <span>{customer.phone}</span> : null}
                            {!customer.email && !customer.phone ? <span className="customers-muted">No contact details</span> : null}
                          </div>
                        </td>
                        <td>
                          {location ? (
                            <span className="customers-location"><MapPin size={12} />{location}</span>
                          ) : (
                            <span className="customers-muted">—</span>
                          )}
                        </td>
                        <td className="table-date">{formatCreatedDate(customer.created_at)}</td>
                        <td>
                          <span className={`customer-status${customer.archived_at ? " customer-status-archived" : ""}`}>
                            <span aria-hidden="true" />
                            {customer.archived_at ? "Archived" : "Active"}
                          </span>
                        </td>
                        {canManage ? (
                          <td>
                            <div className="customer-row-actions">
                              <button
                                aria-label={`Edit ${customer.name}`}
                                className="icon-button"
                                disabled={pending}
                                onClick={() => setEditingCustomer(customer)}
                                type="button"
                              >
                                <Pencil size={14} />
                              </button>
                              {!customer.archived_at ? (
                                <button
                                  aria-label={`Archive ${customer.name}`}
                                  className="icon-button customer-archive-button"
                                  disabled={pending}
                                  onClick={() => setArchivingCustomer(customer)}
                                  type="button"
                                >
                                  <Archive size={14} />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="customers-pagination">
              <span>
                Showing {offset + 1}–{offset + customers.length}
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
                <Button onClick={() => setEditingCustomer(null)} variant="primary">
                  <Plus size={15} /> Add customer
                </Button>
              ) : undefined}
              description={
                appliedSearch
                  ? "Try a different search, or clear the search field."
                  : includeArchived
                    ? "There are no customers matching this view."
                    : "Customers you add to this workspace will appear here."
              }
              title={appliedSearch ? "No matching customers" : "No customers yet"}
            />
            {offset > 0 ? (
              <div className="customers-pagination">
                <span>No customers on this page.</span>
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

      {editingCustomer !== undefined ? (
        <CustomerFormDialog
          customer={editingCustomer}
          onClose={() => setEditingCustomer(undefined)}
          onSaved={async () => {
            await refreshList();
            setSuccessMessage(editingCustomer ? "Customer changes saved." : "Customer created.");
          }}
        />
      ) : null}
      {archivingCustomer ? (
        <ArchiveDialog
          customer={archivingCustomer}
          onCancel={() => setArchivingCustomer(null)}
          onConfirm={() => void confirmArchive()}
          pending={archivePending}
        />
      ) : null}
    </div>
  );
}
