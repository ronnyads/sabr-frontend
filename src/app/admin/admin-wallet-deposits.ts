import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { WalletDeposit, WalletService } from '../core/services/wallet.service';

@Component({ selector:'app-admin-wallet-deposits', standalone:true, imports:[CommonModule,FormsModule], templateUrl:'./admin-wallet-deposits.html', styleUrls:['./admin-wallet-deposits.scss'] })
export class AdminWalletDeposits implements OnInit {
  items: WalletDeposit[]=[]; loading=true; working=''; status='Pending'; error=''; notes:Record<string,string>={};
  constructor(private readonly service:WalletService){}
  ngOnInit():void{this.load();}
  load():void{this.loading=true;this.error='';this.service.listDeposits(this.status).pipe(finalize(()=>this.loading=false)).subscribe({next:x=>this.items=x,error:()=>this.error='Não foi possível carregar os depósitos.'});}
  review(item:WalletDeposit,action:'approve'|'reject'):void{if(action==='reject'&&!this.notes[item.id]?.trim()){this.error='Informe o motivo da rejeição.';return;}this.working=item.id;this.service.reviewDeposit(item.id,action,this.notes[item.id]||'').pipe(finalize(()=>this.working='')).subscribe({next:()=>this.load(),error:e=>this.error=e?.error?.errors?.[0]?.message??'Não foi possível concluir a análise.'});}
  proof(item:WalletDeposit):void{this.service.getAdminProof(item.id).subscribe(blob=>{const u=URL.createObjectURL(blob);window.open(u,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(u),60000);});}
  money(cents:number):string{return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);}
  statusLabel(value:string):string{return ({Pending:'Pendente',Approved:'Aprovado',Rejected:'Rejeitado',Cancelled:'Cancelado'} as Record<string,string>)[value]??value;}
}
