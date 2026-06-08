import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map, startWith } from 'rxjs';
import { ChiSiamoComponent } from '../chi-siamo/chi-siamo.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { ORDER_PRIORITY_LABELS } from '../../core/models/order.model';
import { OmatApiService } from '../../core/api/omat-api.service';
import { FileUploadComponent } from '../../shared/components/file-upload/file-upload.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { AuthStateService } from '../../core/auth/auth-state.service';

@Component({
  selector: 'app-richieste-ordini',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ChiSiamoComponent,
    SidebarComponent,
    FileUploadComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './richieste-ordini.component.html',
  styleUrl: './richieste-ordini.component.css',
})
export class RichiesteOrdiniComponent implements OnInit {
  private readonly formBuilder = new FormBuilder();
  private readonly api = inject(OmatApiService);
  private readonly auth = inject(AuthStateService);

  protected readonly uploadedFiles = signal<File[]>([]);
  protected readonly submitted = signal(false);
  protected readonly requestSent = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly submitError = signal('');
  protected readonly priorityLabels = ORDER_PRIORITY_LABELS;
  protected readonly requestStatus = computed(() => {
    if (this.isSubmitting()) {
      return 'submitting';
    }

    return this.requestSent() ? 'sent' : 'draft';
  });
  protected readonly requestStatusTitle = computed(() => {
    if (this.isSubmitting()) {
      return 'Invio in corso';
    }

    return this.requestSent() ? 'Richiesta inviata' : 'Richiesta in bozza';
  });

  protected readonly orderForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    customer: ['', [Validators.required, Validators.minLength(2)]],
    material: ['', Validators.required],
    quantity: [1, [Validators.required, Validators.min(1)]],
    priority: ['standard', Validators.required],
    description: ['', Validators.required],
    notes: [''],
  });

  private readonly orderFormValue = toSignal(
    this.orderForm.valueChanges.pipe(
      startWith(null),
      map(() => this.orderForm.getRawValue()),
    ),
    { initialValue: this.orderForm.getRawValue() },
  );

  protected readonly summary = computed(() => {
    const value = this.orderFormValue();

    return {
      customer: value.customer || 'Cliente non indicato',
      material: value.material || 'Materiale da definire',
      quantity: value.quantity || 1,
      priority: this.priorityLabels[value.priority as keyof typeof ORDER_PRIORITY_LABELS],
      files: this.uploadedFiles().length,
    };
  });

  ngOnInit(): void {
    this.orderForm.valueChanges.subscribe(() => {
      if (this.requestSent() && !this.isSubmitting()) {
        this.requestSent.set(false);
      }
    });

    const currentUser = this.auth.user();
    if (currentUser && currentUser.role === 'azienda') {
      this.orderForm.controls.customer.setValue(currentUser.name);
      this.orderForm.controls.customer.disable();
    }
  }

  protected onFilesChanged(files: File[]): void {
    this.uploadedFiles.set(files);
    this.requestSent.set(false);
  }

  protected async submitOrder(): Promise<void> {
    this.submitted.set(true);
    this.requestSent.set(false);
    this.isSubmitting.set(false);
    this.submitError.set('');

    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      this.submitError.set(this.getOrderFormError());
      return;
    }

    this.isSubmitting.set(true);

    const value = this.orderForm.getRawValue();
    let attachments: Array<{
      fileName: string;
      contentType: string;
      size: number;
      dataUrl: string;
    }>;

    try {
      attachments = await Promise.all(
        this.uploadedFiles().map(async (file) => ({
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          dataUrl: await this.readFileAsDataUrl(file),
        })),
      );
    } catch (error) {
      console.error(error);
      this.isSubmitting.set(false);
      this.submitError.set('Impossibile leggere uno degli allegati. Riprova a caricarlo.');
      return;
    }

    const payload = {
      title: value.title,
      material: value.material,
      description: value.description,
      priority: value.priority,
      quantity: value.quantity,
      notes: value.notes,
      attachments,
    };

    this.api.createOrder(payload).subscribe({
      next: () => {
        this.requestSent.set(true);
        this.isSubmitting.set(false);
        this.submitted.set(false);
      },
      error: (error) => {
        console.error(error);
        this.isSubmitting.set(false);
        if (error.status === 401 || error.status === 403) {
          this.submitError.set('Sessione scaduta o permessi insufficienti. Prova a rifare il login.');
        } else if (error.status === 400) {
          this.submitError.set('Dati dell\'ordine non validi. Controlla i campi inseriti.');
        } else {
          this.submitError.set('Errore del server. Riprova più tardi.');
        }
      },
    });
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private getOrderFormError(): string {
    const fieldLabels: Record<string, string> = {
      title: 'Nome lavorazione',
      customer: 'Cliente / azienda',
      material: 'Materiale',
      quantity: 'Quantita',
      priority: 'Priorita',
      description: 'Descrizione ordine',
    };

    const invalidFields = Object.entries(this.orderForm.controls)
      .filter(([, control]) => control.invalid)
      .map(([fieldName]) => fieldLabels[fieldName] ?? fieldName);

    return invalidFields.length
      ? `Controlla questi campi: ${invalidFields.join(', ')}.`
      : 'Controlla i dati inseriti prima di inviare la richiesta.';
  }
}
