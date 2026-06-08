import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ChiSiamoComponent } from '../chi-siamo/chi-siamo.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { ORDER_PRIORITY_LABELS, OrderRequest, OrderStatus } from '../../core/models/order.model';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { OmatApiService } from '../../core/api/omat-api.service';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [RouterLink, ChiSiamoComponent, SidebarComponent, StatusBadgeComponent],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.css',
})
export class OrderDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(OmatApiService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly orderId = this.route.snapshot.paramMap.get('id');

  protected readonly priorityLabels = ORDER_PRIORITY_LABELS;
  protected readonly order = signal<OrderRequest | undefined>(undefined);
  protected readonly statusMessage = signal('');
  protected readonly actionError = signal('');
  protected readonly isUpdating = signal(false);
  protected readonly selectedAttachmentId = signal('');
  protected readonly previewAttachment = computed(() =>
    this.order()?.attachments.find((attachment) => attachment.id === this.selectedAttachmentId()) ??
    this.order()?.attachments.find((attachment) => Boolean(attachment.dataUrl)),
  );
  protected readonly previewUrl = computed<SafeResourceUrl | undefined>(() => {
    const dataUrl = this.previewAttachment()?.dataUrl;

    return dataUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(dataUrl) : undefined;
  });

  ngOnInit(): void {
    if (!this.orderId) {
      return;
    }

    this.api.getOrder(this.orderId).subscribe({
      next: (order) => {
        this.order.set(order);
        this.selectedAttachmentId.set(
          order.attachments.find((attachment) => Boolean(attachment.dataUrl))?.id ?? '',
        );
      },
      error: (error) => console.error(error),
    });
  }

  protected selectAttachment(attachmentId: string): void {
    this.selectedAttachmentId.set(attachmentId);
  }

  protected updateStatus(status: OrderStatus): void {
    const currentOrder = this.order();

    if (!currentOrder || this.isUpdating()) {
      return;
    }

    this.isUpdating.set(true);
    this.statusMessage.set('');
    this.actionError.set('');

    this.api.updateOrderStatus(currentOrder.id, status).subscribe({
      next: (order) => {
        this.order.set(order);
        this.statusMessage.set('Stato ordine aggiornato correttamente.');
        this.isUpdating.set(false);
      },
      error: (error) => {
        console.error(error);
        this.actionError.set('Impossibile aggiornare lo stato ordine.');
        this.isUpdating.set(false);
      },
    });
  }

  protected contactCustomer(email?: string): void {
    if (!email) {
      this.actionError.set('Email cliente non disponibile per questo ordine.');
      return;
    }

    window.location.href = `mailto:${email}`;
  }

  protected formatDate(value?: string): string {
    if (!value) {
      return 'Non disponibile';
    }

    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  protected formatSize(size: number): string {
    if (size < 1024 * 1024) {
      return `${Math.max(1, Math.round(size / 1024))} KB`;
    }

    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  protected isPreviewImage(contentType?: string): boolean {
    return Boolean(contentType?.startsWith('image/'));
  }

  protected isPreviewPdf(contentType?: string): boolean {
    return contentType === 'application/pdf';
  }
}
