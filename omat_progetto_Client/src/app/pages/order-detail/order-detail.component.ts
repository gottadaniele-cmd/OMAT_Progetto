import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChiSiamoComponent } from '../chi-siamo/chi-siamo.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import {
  ORDER_PRIORITY_LABELS,
  OrderQuoteStatus,
  OrderRequest,
  OrderStatus,
} from '../../core/models/order.model';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { OmatApiService } from '../../core/api/omat-api.service';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, ChiSiamoComponent, SidebarComponent, StatusBadgeComponent],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.css',
})
export class OrderDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(OmatApiService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly formBuilder = new FormBuilder();
  private readonly orderId = this.route.snapshot.paramMap.get('id');

  protected readonly priorityLabels = ORDER_PRIORITY_LABELS;
  protected readonly order = signal<OrderRequest | undefined>(undefined);
  protected readonly statusMessage = signal('');
  protected readonly actionError = signal('');
  protected readonly isUpdating = signal(false);
  protected readonly isSavingQuote = signal(false);
  protected readonly selectedAttachmentId = signal('');
  protected readonly quoteForm = this.formBuilder.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    notes: [''],
  });
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
        this.patchQuoteForm(order);
        this.selectedAttachmentId.set(
          order.attachments.find((attachment) => Boolean(attachment.dataUrl))?.id ?? '',
        );
      },
      error: (error) => console.error(error),
    });
  }

  protected saveQuote(status: OrderQuoteStatus = 'sent', shouldOpenEmail = false): void {
    const currentOrder = this.order();

    if (!currentOrder || this.quoteForm.invalid || this.isSavingQuote()) {
      this.quoteForm.markAllAsTouched();
      return;
    }

    const value = this.quoteForm.getRawValue();

    this.isSavingQuote.set(true);
    this.statusMessage.set('');
    this.actionError.set('');

    this.api
      .updateOrderQuote(currentOrder.id, {
        amount: value.amount,
        notes: value.notes,
        status,
      })
      .subscribe({
        next: (order) => {
          this.order.set(order);
          this.patchQuoteForm(order);
          this.statusMessage.set('Preventivo salvato nel dettaglio lavorazione.');
          this.isSavingQuote.set(false);

          if (shouldOpenEmail) {
            this.openQuoteEmail(order);
          }
        },
        error: (error) => {
          console.error(error);
          this.actionError.set('Impossibile salvare il preventivo.');
          this.isSavingQuote.set(false);
        },
      });
  }

  protected markQuote(status: 'accepted' | 'rejected'): void {
    const currentOrder = this.order();

    if (!currentOrder || this.isSavingQuote()) {
      return;
    }

    this.isSavingQuote.set(true);
    this.statusMessage.set('');
    this.actionError.set('');

    this.api.updateOrderQuote(currentOrder.id, { status }).subscribe({
      next: (order) => {
        this.order.set(order);
        this.patchQuoteForm(order);
        this.statusMessage.set(
          status === 'accepted' ? 'Preventivo segnato come accettato.' : 'Preventivo segnato come rifiutato.',
        );
        this.isSavingQuote.set(false);
      },
      error: (error) => {
        console.error(error);
        this.actionError.set('Impossibile aggiornare lo stato del preventivo.');
        this.isSavingQuote.set(false);
      },
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

  protected quoteStatusLabel(status: OrderQuoteStatus): string {
    const labels: Record<OrderQuoteStatus, string> = {
      'not-sent': 'Non inviato',
      sent: 'Inviato al cliente',
      accepted: 'Accettato',
      rejected: 'Rifiutato',
    };

    return labels[status];
  }

  protected formatCurrency(value?: number | null): string {
    if (!value) {
      return 'Non indicato';
    }

    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
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

  private patchQuoteForm(order: OrderRequest): void {
    this.quoteForm.patchValue({
      amount: order.quoteAmount ?? 0,
      notes: order.quoteNotes ?? '',
    });
  }

  private openQuoteEmail(order: OrderRequest): void {
    if (!order.customerEmail) {
      this.actionError.set('Preventivo salvato, ma email cliente non disponibile.');
      return;
    }

    const subject = encodeURIComponent(`Preventivo OMAT per ${order.code}`);
    const body = encodeURIComponent(
      [
        `Buongiorno ${order.customer},`,
        '',
        `in merito alla richiesta ${order.code} - ${order.title}, inviamo il preventivo di lavorazione.`,
        '',
        `Importo preventivato: ${this.formatCurrency(order.quoteAmount)}`,
        order.quoteNotes ? `Note: ${order.quoteNotes}` : '',
        '',
        'Puoi rispondere a questa email indicando se accetti o rifiuti il preventivo.',
        '',
        'Cordiali saluti,',
        'OMAT s.n.c.',
      ]
        .filter(Boolean)
        .join('\n'),
    );

    window.location.href = `mailto:${order.customerEmail}?subject=${subject}&body=${body}`;
  }
}
