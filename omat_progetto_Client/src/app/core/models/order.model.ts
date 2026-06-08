export type OrderStatus =
  | 'sent'
  | 'under-review'
  | 'approved'
  | 'in-production'
  | 'completed'
  | 'rejected';

export type OrderPriority = 'standard' | 'urgent' | 'critical';

export interface OrderAttachment {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  dataUrl?: string;
}

export interface OrderRequest {
  id: string;
  code: string;
  title: string;
  customer: string;
  customerEmail?: string;
  material: string;
  quantity: number;
  priority: OrderPriority;
  status: OrderStatus;
  assignedAdmin: string;
  createdAt: string;
  updatedAt?: string;
  description: string;
  notes?: string;
  attachments: OrderAttachment[];
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  sent: 'Inviato',
  'under-review': 'In valutazione',
  approved: 'Approvato',
  'in-production': 'In produzione',
  completed: 'Completato',
  rejected: 'Rifiutato',
};

export const ORDER_PRIORITY_LABELS: Record<OrderPriority, string> = {
  standard: 'Standard',
  urgent: 'Urgente',
  critical: 'Critica',
};
