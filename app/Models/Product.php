<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $guarded = [];

    public function variants()
    {
        return $this->hasMany(ProductVariant::class);
    }

    public function photos()
    {
        return $this->hasMany(ProductPhoto::class)->orderBy('position')->orderBy('id');
    }
}