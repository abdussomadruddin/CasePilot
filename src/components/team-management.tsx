import { Save, Trash2, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { Field } from "@/components/field";
import type { TeamMemberFormValues } from "@/lib/team-store";
import { roleLabels, roles, type Profile, type Role } from "@/lib/types";

export function TeamManagementPanel({
  members,
  saving,
  onCreate,
  onUpdate,
  onDelete,
}: {
  members: Profile[];
  saving: boolean;
  onCreate: (values: TeamMemberFormValues) => Promise<void>;
  onUpdate: (values: TeamMemberFormValues) => Promise<void>;
  onDelete: (member: Profile) => Promise<void>;
}) {
  return (
    <div className="surface-card grid gap-4 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Team Management</h2>
          <p className="text-sm text-muted">
            Manage login ID, password, name, phone and role.
          </p>
        </div>
        <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-semibold text-zinc-400">
          {members.length} members
        </span>
      </div>

      <TeamMemberCreateForm saving={saving} onCreate={onCreate} />

      <div className="grid gap-2">
        {members.map((member) => (
          <TeamMemberEditor
            key={member.id}
            member={member}
            saving={saving}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function TeamMemberCreateForm({
  saving,
  onCreate,
}: {
  saving: boolean;
  onCreate: (values: TeamMemberFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<TeamMemberFormValues>({
    email: "",
    password: "",
    fullName: "",
    phone: "",
    role: "customer_service",
    active: true,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate(values);
    setValues({
      email: "",
      password: "",
      fullName: "",
      phone: "",
      role: "customer_service",
      active: true,
    });
  }

  return (
    <form
      className="grid gap-3 rounded-md bg-zinc-900/70 p-3 ring-1 ring-zinc-800 lg:grid-cols-[1fr_1fr_1fr_1fr_150px_auto]"
      onSubmit={submit}
    >
      <Field label="Login ID / Email">
        <input
          className="field"
          type="email"
          value={values.email}
          onChange={(event) =>
            setValues((current) => ({ ...current, email: event.target.value }))
          }
          required
        />
      </Field>
      <Field label="Password">
        <input
          className="field"
          type="password"
          value={values.password}
          onChange={(event) =>
            setValues((current) => ({ ...current, password: event.target.value }))
          }
          required
        />
      </Field>
      <Field label="Name">
        <input
          className="field"
          value={values.fullName}
          onChange={(event) =>
            setValues((current) => ({ ...current, fullName: event.target.value }))
          }
          required
        />
      </Field>
      <Field label="Phone">
        <input
          className="field"
          type="tel"
          value={values.phone}
          onChange={(event) =>
            setValues((current) => ({ ...current, phone: event.target.value }))
          }
        />
      </Field>
      <Field label="Role">
        <select
          className="field"
          value={values.role}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              role: event.target.value as Role,
            }))
          }
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </select>
      </Field>
      <button className="primary-button self-end" disabled={saving}>
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Add
      </button>
    </form>
  );
}

function TeamMemberEditor({
  member,
  saving,
  onUpdate,
  onDelete,
}: {
  member: Profile;
  saving: boolean;
  onUpdate: (values: TeamMemberFormValues) => Promise<void>;
  onDelete: (member: Profile) => Promise<void>;
}) {
  const [values, setValues] = useState<TeamMemberFormValues>({
    id: member.id,
    email: member.email,
    password: "",
    fullName: member.fullName,
    phone: member.phone || "",
    role: member.role,
    active: member.active ?? true,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onUpdate(values);
    setValues((current) => ({ ...current, password: "" }));
  }

  return (
    <form
      className={`grid gap-3 rounded-md border p-3 lg:grid-cols-[1fr_1fr_1fr_1fr_150px_130px_auto_auto] ${
        values.active
          ? "border-zinc-800 bg-zinc-950"
          : "border-zinc-800 bg-zinc-900/70 opacity-75"
      }`}
      onSubmit={submit}
    >
      <Field label="Login ID / Email">
        <input
          className="field"
          type="email"
          value={values.email}
          onChange={(event) =>
            setValues((current) => ({ ...current, email: event.target.value }))
          }
          required
        />
      </Field>
      <Field label="New Password">
        <input
          className="field"
          type="password"
          value={values.password}
          placeholder="No change"
          onChange={(event) =>
            setValues((current) => ({ ...current, password: event.target.value }))
          }
        />
      </Field>
      <Field label="Name">
        <input
          className="field"
          value={values.fullName}
          onChange={(event) =>
            setValues((current) => ({ ...current, fullName: event.target.value }))
          }
          required
        />
      </Field>
      <Field label="Phone">
        <input
          className="field"
          type="tel"
          value={values.phone}
          onChange={(event) =>
            setValues((current) => ({ ...current, phone: event.target.value }))
          }
        />
      </Field>
      <Field label="Role">
        <select
          className="field"
          value={values.role}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              role: event.target.value as Role,
            }))
          }
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex items-end">
        <button
          type="button"
          role="switch"
          aria-checked={values.active}
          aria-label={`${values.active ? "Deactivate" : "Activate"} ${member.fullName || member.email}`}
          className={`flex h-11 w-full items-center justify-between gap-2 rounded-md border px-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-red-500/70 ${
            values.active
              ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-100"
              : "border-zinc-700 bg-zinc-900 text-zinc-400"
          }`}
          onClick={() =>
            setValues((current) => ({ ...current, active: !current.active }))
          }
        >
          <span
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${
              values.active ? "bg-emerald-500" : "bg-zinc-700"
            }`}
            aria-hidden="true"
          >
            <span
              className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                values.active ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </span>
          <span>{values.active ? "Active" : "Inactive"}</span>
        </button>
      </div>
      <button className="secondary-button self-end" disabled={saving}>
        <Save className="h-4 w-4" aria-hidden="true" />
        Save
      </button>
      <button
        className="danger-button self-end"
        type="button"
        disabled={saving}
        onClick={() => void onDelete(member)}
        title={`Delete ${member.fullName || member.email}`}
        aria-label={`Delete ${member.fullName || member.email}`}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Delete
      </button>
    </form>
  );
}
