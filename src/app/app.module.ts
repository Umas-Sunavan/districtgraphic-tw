import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { GoogleSheetIntercepter, httpInterceptorProviders } from './googleSheetIntercepter';
import { GraphicComponent } from './graphic/graphic.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AngularFireModule } from '@angular/fire';
import { environment } from '../environments/environment';
import { AngularFireDatabaseModule } from '@angular/fire/database';
import { GraphInfoComponent } from './graph-info/graph-info.component';
import { DashDatePipe } from './dash-date.pipe';


@NgModule({
  declarations: [
    AppComponent,
    GraphicComponent,
    GraphInfoComponent,
    DashDatePipe,
  ],
  imports: [
    BrowserModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireDatabaseModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
  ],
  providers: [httpInterceptorProviders],
  bootstrap: [AppComponent]
})
export class AppModule { }
