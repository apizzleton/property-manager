"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ContactInfo {
  mailingAddress: string;
  emailAddress: string;
  phoneNumber: string;
  emergencyNumber: string;
}

export default function ContactInfoPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    mailingAddress: "",
    emailAddress: "",
    phoneNumber: "",
    emergencyNumber: "",
  });

  useEffect(() => {
    fetch("/api/settings/contact-info")
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || "Unable to load contact info.");
        }
        return res.json();
      })
      .then((payload) => {
        setContactInfo({
          mailingAddress: payload.mailingAddress ?? "",
          emailAddress: payload.emailAddress ?? "",
          phoneNumber: payload.phoneNumber ?? "",
          emergencyNumber: payload.emergencyNumber ?? "",
        });
        setError("");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unable to load contact info.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading contact info...</p>;
  if (error) {
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }

  // Tenant contact details come from the property manager's Settings > Contact Info.
  const hasAnyContactInfo = Boolean(
    contactInfo.mailingAddress || contactInfo.emailAddress || contactInfo.phoneNumber || contactInfo.emergencyNumber
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contact Info</h1>
        <p className="text-muted-foreground">How to reach your property management team.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Office Contact Details</CardTitle>
        </CardHeader>
        {hasAnyContactInfo ? (
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Info label="Mailing Address" value={contactInfo.mailingAddress || "Not provided"} />
            <Info label="Email Address" value={contactInfo.emailAddress || "Not provided"} />
            <Info label="Phone Number" value={contactInfo.phoneNumber || "Not provided"} />
            <Info label="Emergency Number" value={contactInfo.emergencyNumber || "Not provided"} />
          </CardContent>
        ) : (
          <CardContent>
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              No contact info has been provided yet. Please check your lease for contact details.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
