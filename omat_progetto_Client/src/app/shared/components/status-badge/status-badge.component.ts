import { Component, computed, input } from '@angular/core';
import { ORDER_STATUS_LABELS, OrderStatus } from '../../../core/models/order.model';
import { PctoRequestStatus } from '../../../core/models/pcto-request.model';

export type UiRequestStatus = OrderStatus | PctoRequestStatus | 'draft' | 'submitting';

const UI_STATUS_LABELS: Record<UiRequestStatus, string> = {
  ...ORDER_STATUS_LABELS,
  draft: 'In bozza',
  submitting: 'Invio...',
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.css',
})
export class StatusBadgeComponent {
  readonly status = input.required<UiRequestStatus>();

  protected readonly label = computed(() => UI_STATUS_LABELS[this.status()]);
}
