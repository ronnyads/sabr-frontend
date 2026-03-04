import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { NbCardModule } from '@nebular/theme';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, NbCardModule],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.scss']
})
export class AdminDashboard {}
