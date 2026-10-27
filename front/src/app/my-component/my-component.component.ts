import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-my-component',
  templateUrl: './my-component.component.html',
  styleUrls: ['./my-component.component.css']
})

export class MyComponentComponent implements OnInit {
  items: any[] = [];

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.getItems();
  }

  getItems(): void {
    this.http.get<any[]>('/api/items').subscribe(
      (response) => {
        this.items = response;
      },
      (error) => {
        console.error('Error:', error);
      }
    );
  }
}