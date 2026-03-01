"use client";

import React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";

/** Unified ledger row for display */
export interface LedgerTableRow {
  id: string;
  date: string;
  type: "charge" | "payment";
  description: string;
  account: string;
  amount: number;
  runningBalance: number;
  paymentStatus?: string;
}

interface LedgerTableProps {
  rows: LedgerTableRow[];
  dateSort: "asc" | "desc";
  onDateSortChange: () => void;
}

/**
 * Shared ledger table: sortable by date, shows type, description, account, amount, running balance.
 * Used in both tenant portal and PM lease detail.
 */
export function LedgerTable({ rows, dateSort, onDateSortChange }: LedgerTableProps) {
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No ledger activity yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <button
              type="button"
              className="flex items-center gap-1 font-medium hover:underline"
              onClick={onDateSortChange}
            >
              Date
              {dateSort === "asc" ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )}
            </button>
          </TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Running Balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="text-muted-foreground">
              {formatDate(row.date)}
            </TableCell>
            <TableCell>
              <span
                className={
                  row.type === "charge"
                    ? "text-destructive font-medium"
                    : "text-success font-medium"
                }
              >
                {row.type === "charge" ? "Charge" : "Payment"}
              </span>
              {row.paymentStatus && row.type === "payment" && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({row.paymentStatus.replace("_", " ")})
                </span>
              )}
            </TableCell>
            <TableCell>{row.description}</TableCell>
            <TableCell className="text-muted-foreground">{row.account}</TableCell>
            <TableCell
              className={`text-right font-medium ${
                row.amount >= 0 ? "text-destructive" : "text-success"
              }`}
            >
              {row.amount >= 0 ? "+" : ""}
              {formatCurrency(row.amount)}
            </TableCell>
            <TableCell
              className={`text-right font-medium ${
                row.runningBalance >= 0 ? "text-destructive" : "text-success"
              }`}
            >
              {formatCurrency(row.runningBalance)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
