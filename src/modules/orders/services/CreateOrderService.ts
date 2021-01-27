import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) { }

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const isCustomerRegistered = await this.customersRepository.findById(
      customer_id,
    );

    if (!isCustomerRegistered) {
      throw new AppError('Could not find a customer with the given id.');
    }

    const existentProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existentProducts.length) {
      throw new AppError('Could not find any products with the given ids.');
    }

    const existentProductIds = existentProducts.map(product => product.id);

    const findInvalidProducts = products.filter(
      product => !existentProductIds.includes(product.id),
    );

    if (findInvalidProducts.length) {
      let errorMessage = '';
      if (findInvalidProducts.length === 1) {
        errorMessage = `${findInvalidProducts[0].id};`;
      } else {
        findInvalidProducts.forEach(invalidProduct => {
          errorMessage += ` ${invalidProduct.id};`;
        });
      }
      throw new AppError(`Could not find the product(s):${errorMessage}`);
    }

    const findProductsWithoutQuantityAvailable = products.filter(
      product =>
        existentProducts.filter(p => p.id === product.id)[0].quantity <
        product.quantity,
    );

    if (findProductsWithoutQuantityAvailable.length) {
      let errorMessage = '';
      if (findProductsWithoutQuantityAvailable.length === 1) {
        errorMessage = ` ${findProductsWithoutQuantityAvailable[0].id}:${findProductsWithoutQuantityAvailable[0].quantity};`;
      } else {
        findProductsWithoutQuantityAvailable.forEach(invalidProduct => {
          errorMessage += ` ${invalidProduct.id}:${invalidProduct.quantity};`;
        });
      }
      throw new AppError(
        `Insufficient quantities in the invertory per product(s):${errorMessage}`,
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: existentProducts.filter(item => item.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer: isCustomerRegistered,
      products: serializedProducts,
    });

    const { order_products } = order;
    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        existentProducts.filter(p => p.id === product.product_id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
